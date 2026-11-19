import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GuestBillScreen } from "../../src/components/GuestBillScreen";
import { formatMoney } from "../../src/lib/api";
import { demoBill } from "../../src/lib/demo-bill";
import { renderGuest } from "./render";
import { stubApi } from "./api-stub";

/**
 * Dividir la cuenta, como lo hace un comensal (R15).
 *
 * Sobre la cuenta de la demo, que es esta misma pantalla con el reparto
 * calculado en el teléfono (`demoSplit`, el mismo resto mayor del servidor):
 * así se prueba la pantalla entera, de «Dividir» al importe que se copia, sin
 * servidor. Lo que sólo pasa con servidor -- reservas, avisos -- está en
 * `guest-payment.test.tsx`.
 *
 * Cuenta de la demo: 75 $ de consumo + 16 % IVA + 10 % servicio = 94,50 $, a
 * 757,5406 Bs/$ = 71.587,59 Bs.
 */

const bill = demoBill();
const TOTAL_VES = BigInt(bill.remainingVes);
const continueButton = () => screen.getByTestId(/^guest-continue/);

/** El botón de seguir, cuando ya dice este importe (el reparto se recalcula al tocar). */
const continueSays = (text: string) =>
  waitFor(() => expect(screen.getByTestId("guest-continue").textContent).toContain(text));

async function openSplit() {
  const user = userEvent.setup();
  renderGuest(<GuestBillScreen demo />);
  await user.click(await screen.findByRole("button", { name: /Dividir la cuenta/ }));
  return user;
}

beforeEach(() => {
  // La lista de bancos se pide siempre; con ella vacía basta.
  stubApi({ "GET /api/v1/guest/banks": { status: 200, body: { data: [] } } });
});
afterEach(cleanup);

describe("dividir la cuenta", () => {
  test("se entra en «Lo mío», sin nada marcado y sin poder seguir", async () => {
    await openSplit();
    expect(screen.getByTestId("guest-split-mode-ITEMS").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("guest-split-mode-EQUAL").getAttribute("aria-pressed")).toBe("false");
    expect(continueButton().textContent).toContain("Marca lo que consumiste");
    expect((continueButton() as HTMLButtonElement).disabled).toBe(true);
  });

  test("lo mío paga su parte del total, con IVA y servicio repartidos", async () => {
    const user = await openSplit();
    await user.click(screen.getByRole("button", { name: /Tequeños/ }));

    // 8 $ de 75 $ de consumo: 8/75 del total en bolívares, redondeado al céntimo.
    const share = (TOTAL_VES * 8n * 2n + 75n) / (75n * 2n);
    await continueSays(formatMoney(share.toString(), "VES"));
    expect(continueButton().textContent).toContain("7.636,01");
  });

  test("las cantidades no pasan de lo que hay en la cuenta ni bajan de cero", async () => {
    const user = await openSplit();
    const minus = screen.getByRole("button", {
      name: "Quitar una unidad de Hamburguesa de la casa",
    });
    const plus = screen.getByRole("button", {
      name: "Añadir una unidad de Hamburguesa de la casa",
    });
    expect((minus as HTMLButtonElement).disabled).toBe(true);

    await user.click(plus);
    await user.click(plus);
    expect((plus as HTMLButtonElement).disabled).toBe(true);
    expect((minus as HTMLButtonElement).disabled).toBe(false);

    // Dos hamburguesas: 30 $ de 75 $, es decir 2/5 del total (28.635,036 Bs).
    // El céntimo suelto lo decide el resto mayor; aquí sólo importa que la
    // parte sea ésa y no la de una hamburguesa ni la de tres.
    await continueSays("28.635,03");
  });

  test("partes iguales divide lo que queda entre los que son", async () => {
    const user = await openSplit();
    await user.click(screen.getByTestId("guest-split-mode-EQUAL"));
    await continueSays("35.793,80");
    // Dividir entre uno no es dividir.
    expect(
      (screen.getByRole("button", { name: "Una persona menos" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Una persona más" }));
    // Entre tres; el céntimo que sobra se lo lleva uno, no se pierde.
    const third = TOTAL_VES / 3n + (TOTAL_VES % 3n > 0n ? 1n : 0n);
    await continueSays(formatMoney(third.toString(), "VES"));
  });

  test("un monto: sin importe no se puede seguir", async () => {
    const user = await openSplit();
    await user.click(screen.getByTestId("guest-split-mode-CUSTOM"));
    expect((continueButton() as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByPlaceholderText("0,00"), "10000");
    await continueSays("10.000,00");
  });

  test("«Mejor pago toda la cuenta» deshace el reparto", async () => {
    const user = await openSplit();
    await user.click(screen.getByTestId("guest-split-cancel"));
    expect(screen.queryByTestId("guest-split-mode-ITEMS")).toBeNull();
    expect(screen.getByRole("button", { name: /Pagar la cuenta/ }).textContent).toContain(
      formatMoney(bill.remainingVes, "VES"),
    );
  });
});

describe("propina y pago", () => {
  test("la propina se suma a lo que se transfiere, y el importe para copiar la lleva", async () => {
    const user = await openSplit();
    await user.click(screen.getByRole("button", { name: /Tequeños/ }));
    await continueSays("7.636,01");
    await user.click(continueButton());

    await user.click(screen.getByRole("button", { name: "10%" }));
    // 10 % sobre 7.636,01 Bs.
    const go = screen.getByRole("button", { name: /Continuar/ });
    expect(go.textContent).toContain("8.399,61");
    await user.click(go);

    // Pago móvil, y el monto para copiar es parte + propina.
    expect(screen.getByTestId("guest-pay-tab-payee").getAttribute("aria-pressed")).toBe("true");
    const amountRow = screen.getByRole("button", { name: "Copiar Monto" }).parentElement!;
    expect(within(amountRow).getByText(/8\.399,61/)).toBeTruthy();
  });

  test("«Ya pagué» no deja avisar sin una referencia", async () => {
    const user = await openSplit();
    await user.click(screen.getByTestId("guest-split-cancel"));
    await user.click(screen.getByRole("button", { name: /Pagar la cuenta/ }));
    await user.click(screen.getByRole("button", { name: /Continuar/ }));
    await user.click(screen.getByTestId("guest-pay-tab-claim"));

    const submit = screen.getByTestId("guest-claim-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await user.type(screen.getByLabelText(/Referencia/), "12");
    expect(submit.disabled).toBe(true);
    await user.type(screen.getByLabelText(/Referencia/), "3456");
    expect(submit.disabled).toBe(false);

    await user.click(submit);
    expect(await screen.findByTestId("guest-claim-sent")).toBeTruthy();
  });
});
