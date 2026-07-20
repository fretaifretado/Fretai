import { useState, useEffect, useCallback } from "react";
import { ScrollText, RefreshCw, Download, Search, Building2, Filter, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiUrl } from "@/lib/api";

interface EmployeeImportLog {
  id: number;
  companyId: number;
  userId: number | null;
  userEmail: string | null;
  employeeId: number | null;
  name: string;
  cpf: string;
  status: string;
  reason: string | null;
  createdAt: string;
}

interface Company {
  id: number;
  name: string;
}

interface Props { token: string }

const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  inserted: { label: "Inserido", color: "bg-green-100 text-green-700", icon: CheckCircle },
  skipped: { label: "Pulado", color: "bg-red-100 text-red-700", icon: XCircle },
};

export default function EmployeeImportLogsSection({ token }: Props) {
  const [logs, setLogs] = useState<EmployeeImportLog[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (selectedCompany !== "all") params.append("companyId", selectedCompany);
      if (selectedStatus !== "all") params.append("status", selectedStatus);
      if (search) params.append("search", search);

      const res = await fetch(apiUrl(`/api/admin/employee-import-logs?${params.toString()}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Erro ao carregar logs");
      }
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching logs:", err);
      setError(err instanceof Error ? err.message : "Erro ao carregar logs");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [token, selectedCompany, selectedStatus, search]);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/admin/companies"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCompanies(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Error fetching companies:", err);
    }
  }, [token]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedCompany !== "all") params.append("companyId", selectedCompany);
      if (selectedStatus !== "all") params.append("status", selectedStatus);
      if (search) params.append("search", search);

      const res = await fetch(apiUrl(`/api/admin/employee-import-logs/export?${params.toString()}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erro ao exportar logs");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "employee-import-logs.csv";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Error exporting logs:", err);
      alert("Erro ao exportar logs");
    }
  };

  const filteredLogs = logs;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground mb-0.5">Logs de Importação de Colaboradores</h1>
          <p className="text-muted-foreground text-sm">Histórico detalhado de importações em lote de colaboradores</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading} className="gap-2">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
            <Download size={14} />
            Exportar CSV
          </Button>
        </div>
      </div>

      <div className="bg-card border rounded-xl shadow-sm p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input 
              className="pl-9" 
              placeholder="Buscar por nome..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={selectedCompany} onValueChange={v => setSelectedCompany(v)}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Todas empresas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas empresas</SelectItem>
              {companies.map(c => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedStatus} onValueChange={v => setSelectedStatus(v)}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Todos status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="inserted">Inseridos</SelectItem>
              <SelectItem value="skipped">Pulados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : error ? (
          <div className="py-16 text-center">
            <ScrollText size={36} className="text-red-500/30 mx-auto mb-3" />
            <p className="text-red-500 font-medium text-sm mb-2">Erro ao carregar logs</p>
            <p className="text-muted-foreground text-xs">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchLogs} className="mt-4">
              Tentar novamente
            </Button>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center">
            <ScrollText size={36} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium text-sm">Nenhum log encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  {["Data", "Usuário", "Empresa ID", "Nome", "CPF", "Status", "Motivo"].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredLogs.map(log => {
                  const meta = STATUS_META[log.status] || { label: log.status, color: "bg-gray-100 text-gray-700", icon: null };
                  const Icon = meta.icon;
                  return (
                    <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3.5 text-muted-foreground text-xs">
                        {new Date(log.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">{log.userEmail || "—"}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{log.companyId}</td>
                      <td className="px-5 py-3.5 font-medium text-foreground">{log.name}</td>
                      <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">{log.cpf}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-medium ${meta.color}`}>
                          {Icon && <Icon size={11} />}
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground text-xs max-w-xs truncate">{log.reason || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
