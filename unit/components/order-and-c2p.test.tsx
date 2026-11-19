import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GuestC2PForm } from "../../src/components/GuestC2PForm";
import { GuestOrderBar } from "../../src/components/GuestOrderBar";
import { GuestSplitProgress } from "../../src/components/GuestSplitProgress";
import type { PublicProduct } from "../../src/lib/api";
import { renderGuest } from "./render";
import { signInGuest, stubApi } from "./api-stub";

/**
 * Los dos envíos de comensal que no tenían prueba: pedir desde la mesa y
 * pagar con C2P. Los dos son de los que no se pueden repetir a ciegas.
 */

const ORDERS = "/api/v1/guest/bill/orders";
const C2P = "/api/v1/guest/bill/c2p";
const BANKS = "/api/v1/guest/c2p/banks";

const product: PublicProduct = {
  id: "p1",
  name: "Tequeños",
  description: null,
  priceMinorUnits: "1000000",
  currency: "VES",
  categoryId: null,
  categoryName: null,
  imageUrl: null,
};

const realTimeout = AbortSignal.timeout;

beforeEach(() => signInGuest());
afterEach(() => {
  cleanup();
  AbortSignal.timeout = realTimeout;
});

function orderBar(onSent: (sent: { orderId: string; status: string }) => void = () => {}) {
  return renderGuest(
    <GuestOrderBar
      quantities={{ p1: 2 }}
      products={[product]}
      qrToken="qr"
      bump={() => {}}
      onSent={onSent}
    />,
  );
}

async function sendOrder(note?: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /Ver pedido/ }));
  if (note) await user.type(screen.getByLabelText(/nota/i), note);
  await user.click(screen.getByTestId("guest-send-order"));
}

describe("pedir desde la mesa", () => {
  test("manda las líneas y la nota, y avisa si queda esperando a la sala", async () => {
    const api = stubApi({
      [`POST ${ORDERS}`]: {
        status: 201,
        body: { orderId: "o1", createdAt: "2026-11-19T20:00:00Z", lineCount: 1, status: "HELD" },
      },
    });
    const sent: { orderId: string; status: string }[] = [];
    orderBar((s) => sent.push(s));

    await sendOrder("sin picante");

    await waitFor(() => expect(sent).toEqual([{ orderId: "o1", status: "HELD" }]));
    expect(api.to("POST", ORDERS)[0]?.body).toEqual({
      items: [{ productId: "p1", quantity: 2 }],
      note: "sin picante",
    });
  });

  test("un backend que no dice el estado se lee como pedido hecho", async () => {
    stubApi({
      [`POST ${ORDERS}`]: {
        status: 201,
        body: { orderId: "o2", createdAt: "2026-11-19T20:00:00Z", lineCount: 1 },
      },
    });
    const sent: { orderId: string; status: string }[] = [];
    orderBar((s) => sent.push(s));

    await sendOrder();

    await waitFor(() => expect(sent).toEqual([{ orderId: "o2", status: "PLACED" }]));
  });

  test("si la conexión se corta, no dice que falló: dice que no sabe", async () => {
    // Un plazo de 20 ms en vez de 30 s, y un servidor que no contesta nunca.
    AbortSignal.timeout = (() => realTimeout.call(AbortSignal, 20)) as typeof AbortSignal.timeout;
    globalThis.fetch = ((_: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () => reject(new DOMException("", "AbortError"))),
      )) as unknown as typeof fetch;
    const sent: unknown[] = [];
    orderBar((s) => sent.push(s));

    await sendOrder();

    expect(await screen.findByText(/no sabemos si tu pedido llegó/)).toBeTruthy();
    expect(sent).toEqual([]);
  });

  test("un reintento tras un corte lleva la misma clave de idempotencia", async () => {
    // Primero se corta (sin señal); el comensal pulsa otra vez y llega.
    let calls = 0;
    const keys: (string | undefined)[] = [];
    globalThis.fetch = ((_: unknown, init?: RequestInit) => {
      keys.push((init?.headers as Record<string, string>)["Idempotency-Key"]);
      calls++;
      if (calls === 1) return Promise.reject(new TypeError("Failed to fetch"));
      return Promise.resolve(
        new Response(
          JSON.stringify({ orderId: "o3", createdAt: "x", lineCount: 1, status: "PLACED" }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      );
    }) as unknown as typeof fetch;
    const sent: unknown[] = [];
    orderBar((s) => sent.push(s));

    await sendOrder();
    expect(await screen.findByText(/Sin conexión/)).toBeTruthy();
    await userEvent.setup().click(screen.getByTestId("guest-send-order"));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  test("otro pedido igual después de uno que llegó es un pedido nuevo, con otra clave", async () => {
    const api = stubApi({
      [`POST ${ORDERS}`]: {
        status: 201,
        body: { orderId: "o4", createdAt: "x", lineCount: 1, status: "PLACED" },
      },
    });
    orderBar();

    await sendOrder();
    await waitFor(() => expect(api.to("POST", ORDERS)).toHaveLength(1));
    await sendOrder();
    await waitFor(() => expect(api.to("POST", ORDERS)).toHaveLength(2));

    const [first, second] = api.to("POST", ORDERS).map((c) => c.headers["Idempotency-Key"]);
    expect(first).toBeTruthy();
    expect(second).not.toBe(first);
  });

  test("sin señal, pide reintentar", async () => {
    globalThis.fetch = (() =>
      Promise.reject(new TypeError("Failed to fetch"))) as unknown as typeof fetch;
    orderBar();

    await sendOrder();

    expect(await screen.findByText(/Sin conexión/)).toBeTruthy();
  });
});

const bank = {
  bankCode: "0105",
  bankName: "Mercantil",
  ttlMinutes: 360,
  ttlLabel: "6 horas",
  amountBound: false,
  strategy: null,
  channels: [{ channel: "SMS", text: "Envía un SMS", shortCode: "24024" }],
};

async function fillC2P() {
  const user = userEvent.setup();
  await screen.findByRole("option", { name: /Mercantil/ });
  await user.type(document.getElementById("c2p-id") as HTMLElement, "12345678");
  await user.type(document.getElementById("c2p-phone") as HTMLElement, "04141234567");
  await user.type(document.getElementById("c2p-clave") as HTMLElement, "123456");
  await user.click(screen.getByRole("button", { name: /Pagar con C2P/ }));
}

describe("pagar con C2P", () => {
  test("cobra la parte y la propina por separado, con clave de idempotencia", async () => {
    const api = stubApi({
      [`GET ${BANKS}`]: { status: 200, body: { data: [bank] } },
      [`POST ${C2P}`]: {
        status: 200,
        body: { paymentId: "pay1", status: "SUCCEEDED", reason: null, bankReference: "998877" },
      },
    });
    renderGuest(<GuestC2PForm maxVes="2000000" tipVes="200000" demo={false} />);

    await fillC2P();

    expect(await screen.findByText("Pago confirmado")).toBeTruthy();
    const [call] = api.to("POST", C2P);
    expect(call?.body).toMatchObject({
      amountVes: "2000000",
      tipVes: "200000",
      bankCode: "0105",
      idNumber: "V12345678",
      phone: "04141234567",
      clave: "123456",
    });
    const key = (call?.body as { idempotencyKey: string }).idempotencyKey;
    expect(key).toBeTruthy();
    expect(call?.headers["Idempotency-Key"]).toBe(key);
    expect(screen.getByText(/998877/)).toBeTruthy();
  });

  test("tras un rechazo, la clave se borra y el intento nuevo lleva otra clave de idempotencia", async () => {
    const api = stubApi({
      [`GET ${BANKS}`]: { status: 200, body: { data: [bank] } },
      [`POST ${C2P}`]: {
        status: 200,
        body: { paymentId: "pay2", status: "FAILED", reason: "Clave inválida" },
      },
    });
    renderGuest(<GuestC2PForm maxVes="2000000" demo={false} />);
    const user = userEvent.setup();

    await fillC2P();
    expect(await screen.findByText("Clave inválida")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    const clave = document.getElementById("c2p-clave") as HTMLInputElement;
    expect(clave.value).toBe("");
    await user.type(clave, "654321");
    await user.click(screen.getByRole("button", { name: /Pagar con C2P/ }));

    await waitFor(() => expect(api.to("POST", C2P)).toHaveLength(2));
    const [first, second] = api
      .to("POST", C2P)
      .map((c) => (c.body as { idempotencyKey: string }).idempotencyKey);
    expect(second).not.toBe(first);
  });
});

describe("ponerle nombre a tu parte", () => {
  const share = (ref: string) => ({
    id: `id-${ref}`,
    ref,
    name: null,
    amountVes: "500000",
    amountPaidVes: "0",
    remainingVes: "500000",
    settled: false,
    usdReference: null,
  });
  const split = {
    id: "s1",
    billId: "b1",
    mode: "EQUAL" as const,
    status: "ACTIVE" as const,
    currency: "VES" as const,
    basisVes: "1000000",
    createdByType: "GUEST" as const,
    participants: [share("p1"), share("p2")],
  };

  test("si no se guarda, lo dice en vez de quedarse callado", async () => {
    globalThis.fetch = (() =>
      Promise.reject(new TypeError("Failed to fetch"))) as unknown as typeof fetch;
    const changed: number[] = [];
    renderGuest(
      <GuestSplitProgress
        split={split}
        mineRef="p1"
        onPick={() => {}}
        onChanged={() => changed.push(1)}
      />,
    );
    const user = userEvent.setup();

    await user.type(screen.getByTestId("guest-share-name"), "Ana");
    await user.click(screen.getByTestId("guest-share-name-save"));

    expect(await screen.findByText(/No hemos podido conectar/)).toBeTruthy();
    expect(changed).toEqual([]);
  });
});
