import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GuestPaymentPanel } from "../../src/components/GuestPaymentPanel";
import { formatMoney, type Bill } from "../../src/lib/api";
import { demoBill } from "../../src/lib/demo-bill";
import { renderGuest } from "./render";
import { apiError, signInGuest, stubApi } from "./api-stub";

/**
 * El paso de pagar, contra un servidor de mentira (R15).
 *
 * Lo que aquí se juega es dinero de verdad: que «Ana está pagando» bloquee a
 * los demás de la mesa, que el importe para copiar sea el que toca, y que el
 * aviso de pago le diga al restaurante lo que salió del banco, partido en
 * cuenta y propina como lo cuenta el servidor.
 */

const HOLDS = "/api/v1/guest/bill/holds";
const CLAIMS = "/api/v1/guest/bill/payment-claims";
const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

const bill: Bill = {
  ...demoBill(),
  payee: { bankCode: "0105", bankName: "Mercantil", phone: "04121234567", holderId: "J123456789" },
};
const SHARE = bill.remainingVes; // 7158759 céntimos: 71.587,59 Bs

const banks = { status: 200, body: { data: [] } };
const held = (amountVes: string) => ({
  status: 201,
  body: { id: "hold-1", amountVes, expiresAt: inAnHour() },
});

/** El monto que la pestaña «Pago móvil» ofrece copiar. */
const amountToCopy = () =>
  screen.getByRole("button", { name: "Copiar Monto" }).parentElement!.textContent ?? "";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  signInGuest();
});
afterEach(cleanup);

describe("la reserva: «alguien de la mesa está pagando»", () => {
  test("al abrir el pago se reserva la parte, y al salir se suelta", async () => {
    const api = stubApi({
      "GET /api/v1/guest/banks": banks,
      [`POST ${HOLDS}`]: (call) => held((call.body as { amountVes: string }).amountVes),
      [`DELETE ${HOLDS}`]: { status: 204 },
    });
    const view = renderGuest(<GuestPaymentPanel bill={bill} />);

    expect(await screen.findByTestId("guest-hold-held")).toBeTruthy();
    const [hold] = api.to("POST", HOLDS);
    expect(hold!.body).toEqual({ amountVes: SHARE });
    // Las dos cabeceras del comensal, juntas: con una sola el servidor dice 401.
    expect(hold!.headers["X-Guest-Session"]).toBe("sess-1");
    expect(hold!.headers["Authorization"]).toBe("Bearer guest-token");
    expect(amountToCopy()).toContain(formatMoney(SHARE, "VES"));

    view.unmount();
    await waitFor(() => expect(api.to("DELETE", HOLDS)).toHaveLength(1));
  });

  test("si otro paga una parte, se reserva lo que queda libre y se copia eso", async () => {
    const api = stubApi({
      "GET /api/v1/guest/banks": banks,
      [`POST ${HOLDS}`]: (call) =>
        (call.body as { amountVes: string }).amountVes === SHARE
          ? apiError(409, "PAYMENT_HELD", { availableVes: "3000000", heldVes: "4158759" })
          : held("3000000"),
    });
    renderGuest(<GuestPaymentPanel bill={bill} />);

    const note = await screen.findByTestId("guest-hold-held");
    expect(note.textContent).toContain("30.000,00");
    expect(api.to("POST", HOLDS).map((c) => c.body)).toEqual([
      { amountVes: SHARE },
      { amountVes: "3000000" },
    ]);
    expect(amountToCopy()).toContain("30.000,00");
  });

  test("si otro paga todo lo que queda, no se ofrecen los datos para transferir", async () => {
    const user = userEvent.setup();
    stubApi({
      "GET /api/v1/guest/banks": banks,
      [`POST ${HOLDS}`]: apiError(409, "PAYMENT_HELD", {
        availableVes: "0",
        heldVes: SHARE,
        heldUntil: inAnHour(),
      }),
    });
    renderGuest(<GuestPaymentPanel bill={bill} />);

    const blocked = await screen.findByTestId("guest-hold-blocked");
    expect(blocked.textContent).toContain(formatMoney(SHARE, "VES"));
    expect(screen.queryByRole("button", { name: "Copiar Monto" })).toBeNull();

    // Quien transfirió de todos modos todavía puede avisar.
    await user.click(screen.getByTestId("guest-hold-paid-anyway"));
    expect(screen.getByTestId("guest-pay-tab-claim").getAttribute("aria-pressed")).toBe("true");
  });

  test("sin reserva (servidor caído) se paga igual: no bloquea a nadie", async () => {
    stubApi({
      "GET /api/v1/guest/banks": banks,
      [`POST ${HOLDS}`]: apiError(503, "SERVICE_UNAVAILABLE"),
    });
    renderGuest(<GuestPaymentPanel bill={bill} />);

    await waitFor(() => expect(amountToCopy()).toContain(formatMoney(SHARE, "VES")));
    expect(screen.queryByTestId("guest-hold-blocked")).toBeNull();
  });
});

describe("«Ya pagué»: el aviso que verifica el restaurante", () => {
  const open = async (props: Partial<Parameters<typeof GuestPaymentPanel>[0]> = {}) => {
    const user = userEvent.setup();
    const onClaimSent = mock(() => undefined);
    renderGuest(<GuestPaymentPanel bill={bill} onClaimSent={onClaimSent} {...props} />);
    await user.click(screen.getByTestId("guest-pay-tab-claim"));
    return { user, onClaimSent };
  };

  test("lo transferido se parte en cuenta y propina, y se avisa una vez", async () => {
    const api = stubApi({
      "GET /api/v1/guest/banks": banks,
      [`POST ${HOLDS}`]: held(SHARE),
      [`POST ${CLAIMS}`]: (call) => ({
        status: 201,
        body: {
          id: "claim-1",
          status: "PENDING",
          createdAt: new Date().toISOString(),
          ...(call.body as object),
        },
      }),
    });
    const { user, onClaimSent } = await open({ tipVes: "500000" });

    // Lo sugerido es parte + propina: lo que de verdad sale del banco.
    const amount = screen.getByLabelText("Monto pagado (Bs)") as HTMLInputElement;
    expect(amount.value).toBe("76.587,59"); // 71.587,59 + 5.000,00

    await user.type(screen.getByLabelText("Referencia de tu pago"), "00123456");
    await user.click(screen.getByTestId("guest-claim-submit"));

    expect(await screen.findByTestId("guest-claim-sent")).toBeTruthy();
    expect(api.to("POST", CLAIMS).map((c) => c.body)).toEqual([
      { amountVes: SHARE, tipVes: "500000", reference: "00123456" },
    ]);
    expect(onClaimSent).toHaveBeenCalledTimes(1);
  });

  test("si transfirió menos que su parte, todo va a la cuenta y nada a propina", async () => {
    const api = stubApi({
      "GET /api/v1/guest/banks": banks,
      [`POST ${HOLDS}`]: held(SHARE),
      [`POST ${CLAIMS}`]: {
        status: 201,
        body: { id: "claim-2", status: "PENDING", amountVes: "1000000" },
      },
    });
    const { user } = await open({ tipVes: "500000" });

    const amount = screen.getByLabelText("Monto pagado (Bs)");
    await user.clear(amount);
    await user.type(amount, "10.000,00");
    await user.type(screen.getByLabelText("Referencia de tu pago"), "998877");
    await user.click(screen.getByTestId("guest-claim-submit"));

    await screen.findByTestId("guest-claim-sent");
    expect(api.to("POST", CLAIMS)[0]!.body).toEqual({ amountVes: "1000000", reference: "998877" });
  });

  test("una referencia ya usada se dice en su casilla", async () => {
    stubApi({
      "GET /api/v1/guest/banks": banks,
      [`POST ${HOLDS}`]: held(SHARE),
      [`POST ${CLAIMS}`]: apiError(409, "PAYMENT_REFERENCE_ALREADY_USED"),
    });
    const { user, onClaimSent } = await open();

    const reference = screen.getByLabelText("Referencia de tu pago");
    await user.type(reference, "123456");
    await user.click(screen.getByTestId("guest-claim-submit"));

    await waitFor(() => expect(reference.getAttribute("aria-invalid")).toBe("true"));
    expect(document.activeElement).toBe(reference);
    expect(screen.queryByTestId("guest-claim-sent")).toBeNull();
    expect(onClaimSent).not.toHaveBeenCalled();
  });

  test("pasarse del saldo ofrece el importe correcto", async () => {
    stubApi({
      "GET /api/v1/guest/banks": banks,
      [`POST ${HOLDS}`]: held(SHARE),
      [`POST ${CLAIMS}`]: apiError(422, "PAYMENT_EXCEEDS_BALANCE", { remainingVes: "2000000" }),
    });
    const { user } = await open();

    await user.type(screen.getByLabelText("Referencia de tu pago"), "123456");
    await user.click(screen.getByTestId("guest-claim-submit"));

    const amount = screen.getByLabelText("Monto pagado (Bs)");
    await waitFor(() => expect(amount.getAttribute("aria-invalid")).toBe("true"));
    expect(within(amount.closest("form")!).getAllByText(/20\.000,00/).length).toBeGreaterThan(0);
  });
});
