import DashboardLayout from "./layout";
import { FileText, Download, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function NotasFiscaisPage() {
  const compras: never[] = [];
  const totalVales = 0;
  const valorTotal = 0;

  const hoje = new Date();
  const mes = hoje.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const mesCapitalizado = mes.charAt(0).toUpperCase() + mes.slice(1);

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-5xl">

        <div className="flex items-center gap-2 mb-8">
          <FileText size={18} className="text-accent" />
          <h1 className="text-xl font-bold text-foreground">Notas Fiscais</h1>
        </div>

        {/* Card nota vigente */}
        <div className="bg-card border rounded-xl p-6 shadow-sm mb-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-accent/5 rounded-full -translate-y-12 translate-x-12" />
          <div className="relative">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Nota fiscal vigente</p>
                <h2 className="text-xl font-bold text-foreground">{mesCapitalizado}</h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="px-3 py-1.5 rounded-full text-xs font-bold border bg-amber-100 text-amber-700 border-amber-200">
                  Aberta
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Total de vales</p>
                <p className="text-2xl font-bold text-foreground">{totalVales}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Compras vinculadas</p>
                <p className="text-2xl font-bold text-foreground">{compras.length}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs text-muted-foreground mb-1">Total a ser pago</p>
                <p className="text-3xl font-bold text-accent">{fmt(valorTotal)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
          <AlertCircle size={15} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-700">
            Esta nota está em aberto. O fechamento ocorre automaticamente no último dia útil do mês.
            Após o fechamento, o arquivo PDF ficará disponível para download.
          </p>
        </div>

        {/* Compras vinculadas */}
        <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h3 className="font-semibold text-foreground text-sm">Compras vinculadas</h3>
          </div>
          {compras.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Nenhuma compra vinculada a esta nota ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b">
                    {["Código", "Data", "Vales", "Valor", "Status"].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {compras.map((c: never) => (
                    <tr key={(c as any).codigo} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{(c as any).codigo}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{(c as any).data}</td>
                      <td className="px-5 py-3.5 font-medium text-foreground">{(c as any).vales.toLocaleString("pt-BR")}</td>
                      <td className="px-5 py-3.5 font-semibold text-foreground">{fmt((c as any).total)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${
                          (c as any).status === "Aprovado"
                            ? "bg-green-100 text-green-700 border-green-200"
                            : "bg-blue-100 text-blue-700 border-blue-200"
                        }`}>
                          {(c as any).status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}