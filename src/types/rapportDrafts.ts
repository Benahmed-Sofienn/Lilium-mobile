export type VisitType = "medical" | "commercial";
export type CommercialClientType = "Pharmacie" | "Grossiste" | "SuperGros";

export type MedicalProductDraft = {
  _key: string;
  produit_id: number | null;
  rentabilite: number | null;
  note: string;
};

export type CommercialProductDraft = {
  _key: string;
  produit_id: number | null;
  prescription: boolean | null; // true=prescrit, false=ne prescrit pas
  en_stock: boolean | null; // true=en stock, false=en rupture
  qtt: number; // always >=0 (DB requires Int)
};

export type MedicalVisitDraft = {
  _key: string;
  visite_type: "medical";
  medecin_id: number | null;
  products: MedicalProductDraft[];
};

export type CommercialVisitDraft = {
  _key: string;
  visite_type: "commercial";
  medecin_id: number | null; // stores client id (same table)
  client_filter: CommercialClientType | null; // UI filter step
  bon_commande: boolean | null; // required final step
  products: CommercialProductDraft[];
};

export type VisitDraft = MedicalVisitDraft | CommercialVisitDraft;
export type ProductDraft = MedicalProductDraft | CommercialProductDraft;

