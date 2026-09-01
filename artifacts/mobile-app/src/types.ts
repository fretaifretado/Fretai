export type ApiRole =
  | "parceiro_master"
  | "motorista"
  | "colaborador"
  | "cliente_master"
  | "cliente_subadmin"
  | "platform_admin";

export type MobileRole = "partner" | "driver" | "collaborator";

export type Session = {
  token: string;
  role: ApiRole;
  userId: number;
  entityId: number | null;
  email: string;
  cpf?: string | null;
  name: string;
  forcePasswordChange: boolean;
};

export type MobileIdentity = {
  user: { id: number; name: string; email: string; role: ApiRole };
  partner: { id: number; name: string; phone: string; email: string } | null;
  driver: { id: number; name: string; cnh: string; cnhCategory: string; isActive: boolean } | null;
  summary: { activeVehicles: number; activeDrivers: number } | null;
};

export type Vehicle = {
  id: number;
  type: string;
  capacity: number;
  plate: string;
  internalId: string | null;
  status: "ativo" | "inativo";
};

export type Driver = {
  id: number;
  name: string;
  cpf: string;
  cnh: string;
  cnhCategory: string;
  email: string;
  isActive: boolean;
};

export type CollaboratorHome = {
  employee: {
    id: number;
    name: string;
    companyName: string;
    homeAddress: string;
    shift: string | null;
  };
  vouchers: { balance: number };
  journey: {
    date: string;
    time: string | null;
    direction: "ida" | "volta";
    pickupAddress: string;
    dropoffAddress: string;
    vehicleCode: string | null;
    vehicleType: string | null;
    routeName: string;
  } | null;
};

export function toMobileRole(role: ApiRole): MobileRole | null {
  if (role === "parceiro_master") return "partner";
  if (role === "motorista") return "driver";
  if (role === "colaborador") return "collaborator";
  return null;
}
