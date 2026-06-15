import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/api";

interface Props {
  open: boolean;
  currentName: string;
  onClose: () => void;
  onSaved: (name: string) => void;
}

interface ProfileResponse {
  id: number;
  name: string | null;
  email: string;
  role: string;
}

export function ProfileSettingsModal({ open, currentName, onClose, onSaved }: Props) {
  const [name, setName] = useState(currentName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(currentName);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setSuccess("");
  }, [open, currentName]);

  if (!open) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (newPassword || confirmPassword || currentPassword) {
      if (newPassword.length < 6) { setError("A nova senha deve ter ao menos 6 caracteres."); return; }
      if (newPassword !== confirmPassword) { setError("As senhas não coincidem."); return; }
      if (!currentPassword) { setError("Informe a senha atual."); return; }
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("jwt_token") ?? "";
      const response = await fetch(apiUrl("/api/me/profile"), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: name.trim(),
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
        }),
      });
      const data = await response.json().catch(() => ({})) as Partial<ProfileResponse> & { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Não foi possível salvar.");
        return;
      }
      const displayName = data.name ?? name.trim();
      localStorage.setItem("jwt_displayname", displayName);
      onSaved(displayName);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Perfil atualizado.");
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4">
      <div className="bg-card border rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-foreground">Editar perfil</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Nome</label>
            <Input value={name} onChange={event => setName(event.target.value)} minLength={2} required />
          </div>

          <div className="pt-2 border-t">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Senha</p>
            <div className="space-y-3">
              <Input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} placeholder="Senha atual" autoComplete="current-password" />
              <Input type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="Nova senha" autoComplete="new-password" />
              <Input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Confirmar nova senha" autoComplete="new-password" />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              <AlertCircle size={14} />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <CheckCircle size={14} />{success}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Fechar</Button>
            <Button type="submit" className="flex-1" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
