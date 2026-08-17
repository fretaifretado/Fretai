import { useState, useEffect } from "react";
import { Download, Building2, Calendar, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Company {
  id: number;
  name: string;
}

interface FinancialReportsSectionProps {
  token: string;
}

export default function FinancialReportsSection({ token }: FinancialReportsSectionProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL ?? "";

  useEffect(() => {
    fetchCompanies();
  }, [token]);

  const fetchCompanies = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/admin/companies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError("Erro ao carregar empresas");
        setCompanies([]);
        return;
      }
      const data = await res.json();
      setCompanies(Array.isArray(data) ? data : []);
    } catch {
      setError("Erro ao carregar empresas");
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (selectedCompany === "all") {
      setError("Selecione uma empresa para gerar o relatório");
      return;
    }

    setDownloading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/api/admin/financial-report/${selectedCompany}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        setError("Erro ao gerar relatório");
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-financeiro.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      setError("Erro ao baixar relatório");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Relatórios Financeiros</h2>
          <p className="text-sm text-muted-foreground">Exporte relatórios financeiros detalhados por empresa</p>
        </div>
      </div>

      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Building2 size={16} />
              Empresa
            </label>
            <Select value={selectedCompany} onValueChange={setSelectedCompany} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id.toString()}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <FileText size={16} />
              Tipo de Relatório
            </label>
            <div className="flex items-center h-10 px-3 border rounded-lg bg-muted/30 text-sm text-muted-foreground">
              Histórico Financeiro Completo
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Calendar size={16} />
              Período
            </label>
            <div className="flex items-center h-10 px-3 border rounded-lg bg-muted/30 text-sm text-muted-foreground">
              Todo o histórico
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button
            onClick={handleDownload}
            disabled={downloading || selectedCompany === "all" || loading}
            className="bg-accent hover:bg-accent/90 text-white"
          >
            {downloading ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Download size={16} className="mr-2" />
                Baixar Relatório XLSX
              </>
            )}
          </Button>

          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="mt-6 p-4 bg-muted/50 rounded-lg border">
          <h3 className="font-medium text-foreground mb-2">Informações do Relatório</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Histórico de compras por mês</li>
            <li>• Vales comprados e não utilizados</li>
            <li>• Créditos gerados por período</li>
            <li>• Evolução acumulada de créditos aplicados</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
