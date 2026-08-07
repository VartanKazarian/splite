export type BillItem = {
  id: string;
  name: { es: string; en: string };
  price: number;
  paid?: boolean;
};

export type TableInfo = {
  id: string;
  number: number;
  seats: number;
  status: "open" | "free" | "partial";
  guests: number;
  openedAt: string;
  items: BillItem[];
};

export const restaurant = {
  name: "La Cava del Ávila",
  city: "Caracas",
  currency: "$",
};

export const tables: TableInfo[] = [
  {
    id: "15",
    number: 15,
    seats: 4,
    status: "open",
    guests: 3,
    openedAt: "19:42",
    items: [
      { id: "i1", name: { es: "Hamburguesa de la casa", en: "House burger" }, price: 15 },
      { id: "i2", name: { es: "Pizza margarita", en: "Margherita pizza" }, price: 18 },
      { id: "i3", name: { es: "Refresco", en: "Soft drink" }, price: 4 },
      { id: "i4", name: { es: "Cerveza artesanal", en: "Craft beer" }, price: 5 },
      { id: "i5", name: { es: "Tequeños (6u)", en: "Tequeños (6)" }, price: 8 },
    ],
  },
  {
    id: "7",
    number: 7,
    seats: 2,
    status: "partial",
    guests: 2,
    openedAt: "20:05",
    items: [
      { id: "j1", name: { es: "Pabellón criollo", en: "Pabellón criollo" }, price: 16, paid: true },
      { id: "j2", name: { es: "Arepa reina pepiada", en: "Reina pepiada arepa" }, price: 9 },
      { id: "j3", name: { es: "Papelón con limón", en: "Papelón lemonade" }, price: 3 },
    ],
  },
  {
    id: "3",
    number: 3,
    seats: 6,
    status: "open",
    guests: 5,
    openedAt: "20:18",
    items: [
      { id: "k1", name: { es: "Parrilla mixta", en: "Mixed grill" }, price: 42 },
      { id: "k2", name: { es: "Ensalada césar", en: "Caesar salad" }, price: 11 },
      { id: "k3", name: { es: "Botella de vino", en: "Bottle of wine" }, price: 28 },
      { id: "k4", name: { es: "Postre del día", en: "Dessert of the day" }, price: 7 },
    ],
  },
  { id: "1", number: 1, seats: 2, status: "free", guests: 0, openedAt: "—", items: [] },
  { id: "2", number: 2, seats: 4, status: "free", guests: 0, openedAt: "—", items: [] },
  { id: "9", number: 9, seats: 4, status: "free", guests: 0, openedAt: "—", items: [] },
];

export const getTable = (id: string) => tables.find((t) => t.id === id);

export const stats = {
  sales: "1.284",
  tip: "12%",
  open: "3",
  tickets: "47",
};
