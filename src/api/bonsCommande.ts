// api/bonsCommande.ts
import { api } from "./client"; // adjust path to your real client.ts export

export type ScopeUser = { id: number; label: string };

export type BonCommande = {
  id: number;
  delegue: string;
  dateAjout: string;
  heureAjout: string;
  status: string;
  clientType: string;
  clientName: string;
  produits: string;
  observation?: string | null;
  flag?: boolean;
};

export type BonsCommandeFilters = {
  startDate?: string;     // YYYY-MM-DD
  endDate?: string;       // YYYY-MM-DD
  selectedUserId?: number;
  officeLilium?: boolean;
  enAttente?: boolean;
  flag?: boolean;
};

// IMPORTANT:
// This assumes your api.baseURL already ends with "/api".
// If it does NOT, change "/bons-commande" to "/api/bons-commande".
const BASE = "/bons-commande";

export async function fetchBonsCommandeScopeUsers() {
  const { data } = await api.get<ScopeUser[]>(`${BASE}/scope-users`);
  return data;
}

export async function fetchBonsCommandeList(filters: BonsCommandeFilters) {
  const params: Record<string, any> = {};

  if (filters.startDate) params.startDate = filters.startDate;
  if (filters.endDate) params.endDate = filters.endDate;
  if (filters.selectedUserId && filters.selectedUserId > 0) params.selectedUserId = filters.selectedUserId;
  if (filters.officeLilium) params.officeLilium = "true";
  if (filters.enAttente) params.enAttente = "true";
  if (filters.flag) params.flag = "true";

  const { data } = await api.get<BonCommande[]>(`${BASE}`, { params });
  return data;
}
