import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GuestRateMeal } from "../../src/components/GuestRateMeal";
import { GuestReceipt } from "../../src/components/GuestReceipt";
import { rememberPayment } from "../../src/lib/guest-payment";
import { renderGuest } from "./render";
import { signInGuest, stubApi } from "./api-stub";

/**
 * Después de pagar (R20): «¿Qué tal todo?» y el recibo por WhatsApp.
 */

const PAYMENT = "11111111-1111-4111-8111-111111111111";
const STATUS = `/api/v1/guest/payments/${PAYMENT}`;
const RATE = `/api/v1/guest/payments/${PAYMENT}/feedback`;
const status = (value: string) => ({
  status: 200,
  body: {
    id: PAYMENT,
    status: value,
    amountVes: "2000000",
    decidedAt: null,
    billClosed: false,
    invoiced: false,
  },
});

const receipt = {
  restaurant: { name: "Casa 72", rif: null, address: null },
  table: { name: "4" },
  bill: {
    id: "b1",
    status: "OPEN",
    currency: "VES",
    openedAt: "2026-11-19T20:00:00Z",
    lines: [
      {
        id: "l1",
        name: "Tequeños",
        quantity: 2,
        unitPriceMinor: "1000000",
        subtotalMinor: "2000000",
        taxCategory: "GENERAL",
        vatBps: 1600,
      },
    ],
    subtotalMinor: "2000000",
    serviceChargeBps: 0,
    serviceChargeMinor: "0",
    taxes: [],
    vatMinor: "0",
    totalMinor: "2000000",
    totalVes: "2000000",
    fxRateVesPerUnit: null,
  },
  payment: {
    id: PAYMENT,
    status: "SUCCEEDED",
    method: "PAGO_MOVIL",
    reference: "00123456",
    amountVes: "2000000",
    tipVes: "0",
    handedOverVes: "2000000",
    declaredAt: "2026-11-19T21:14:00Z",
    invoiced: false,
    invoiceId: null,
  },
};

beforeEach(() => {
  sessionStorage.clear();
  signInGuest();
  rememberPayment(PAYMENT);
});
afterEach(cleanup);

describe("«¿Qué tal todo?»", () => {
  test("una estrella también recibe el enlace a Google: pedírselo sólo a los contentos está prohibido", async () => {
    const user = userEvent.setup();
    const api = stubApi({
      [`GET ${STATUS}`]: status("SUCCEEDED"),
      [`POST ${RATE}`]: {
        status: 200,
        body: { googleReviewUrl: "https://g.page/r/Casa72/review" },
      },
    });
    renderGuest(<GuestRateMeal />);

    await user.click(await screen.findByRole("radio", { name: "1 de 5" }));
    await user.type(screen.getByLabelText(/Algo que contarles/), "La comida llegó fría");
    await user.click(screen.getByTestId("guest-rate-send"));

    const google = await screen.findByTestId("guest-rate-google");
    expect(google.getAttribute("href")).toBe("https://g.page/r/Casa72/review");
    expect(google.getAttribute("rel")).toContain("noopener");
    expect(api.to("POST", RATE)[0]!.body).toEqual({ rating: 1, comment: "La comida llegó fría" });
  });

  test("sin enlace de Google, sólo da las gracias; y no vuelve a preguntar", async () => {
    const user = userEvent.setup();
    stubApi({
      [`GET ${STATUS}`]: status("PENDING"),
      [`POST ${RATE}`]: { status: 200, body: { googleReviewUrl: null } },
    });
    const first = renderGuest(<GuestRateMeal />);
    await user.click(await screen.findByRole("radio", { name: "5 de 5" }));
    await user.click(screen.getByTestId("guest-rate-send"));
    expect(await screen.findByText("¡Gracias por contarnos!")).toBeTruthy();
    expect(screen.queryByTestId("guest-rate-google")).toBeNull();

    first.unmount();
    renderGuest(<GuestRateMeal />);
    expect(await screen.findByTestId("guest-rated")).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  test("con un pago rechazado no se pregunta", async () => {
    stubApi({ [`GET ${STATUS}`]: status("FAILED") });
    renderGuest(<GuestRateMeal />);
    await waitFor(() => expect(document.body.textContent).toBe(""));
    expect(screen.queryByTestId("guest-rate")).toBeNull();
  });
});

describe("el recibo por WhatsApp", () => {
  test("abre WhatsApp con el enlace firmado al recibo", async () => {
    const user = userEvent.setup();
    const api = stubApi({
      [`GET /api/v1/guest/payments/${PAYMENT}/receipt`]: { status: 200, body: receipt },
      [`POST /api/v1/guest/payments/${PAYMENT}/receipt-link`]: {
        status: 200,
        body: { token: "abc.def", expiresAt: "2027-05-18T00:00:00Z" },
      },
    });
    const opened = { href: "" };
    const original = window.open;
    window.open = (() => ({
      location: opened,
      close: () => undefined,
    })) as unknown as typeof window.open;
    try {
      renderGuest(<GuestReceipt />);
      await user.click(await screen.findByTestId("receipt-share-whatsapp"));
      await waitFor(() => expect(opened.href).toStartWith("https://wa.me/?text="));
      const text = decodeURIComponent(opened.href.slice("https://wa.me/?text=".length));
      expect(text).toContain("Casa 72");
      expect(text).toContain("20.000,00");
      expect(text).toContain("https://splite.lat/recibo/abc.def");
      expect(api.to("POST", `/api/v1/guest/payments/${PAYMENT}/receipt-link`)).toHaveLength(1);
    } finally {
      window.open = original;
    }
  });
});
