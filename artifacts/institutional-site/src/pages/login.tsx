import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Lock, Mail, Eye, EyeOff, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const loginSchema = z.object({
  email: z.string().min(1, "Usuário ou e-mail é obrigatório"),
  password: z.string().min(1, "Senha é obrigatória"),
});
type LoginForm = z.infer<typeof loginSchema>;

const forgotSchema = z.object({
  email: z.string().email("E-mail inválido"),
});
type ForgotForm = z.infer<typeof forgotSchema>;

const changeSchema = z.object({
  newPassword: z.string().min(6, "A senha deve ter ao menos 6 caracteres"),
  confirmPassword: z.string().min(1, "Confirme a nova senha"),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});
type ChangeForm = z.infer<typeof changeSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [screen, setScreen] = useState<"login" | "forgot" | "forgot-success" | "change-password">("login");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [changeLoading, setChangeLoading] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const forgotForm = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  const changeForm = useForm<ChangeForm>({
    resolver: zodResolver(changeSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: LoginForm) {
    setLoading(true);
    setError("");
    const emailTrimmed = values.email.trim();
    const passwordTrimmed = values.password.trim();

    try {
      const isAdminLogin = !emailTrimmed.includes("@");

      if (isAdminLogin) {
        const res = await fetch("/api/auth/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: emailTrimmed, password: passwordTrimmed }),
        });
        const data = await res.json() as { token?: string; username?: string; role?: string; error?: string };
        if (!res.ok) { setError(data.error ?? "Credenciais inválidas"); return; }
        localStorage.setItem("admin_token", data.token!);
        localStorage.setItem("admin_username", data.username!);
        localStorage.setItem("admin_displayname", data.username!);
        localStorage.setItem("admin_role", data.role ?? "platform_admin");
        setLocation("/admin");
      } else {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: emailTrimmed, password: passwordTrimmed }),
        });
        const data = await res.json() as {
          token?: string;
          email?: string;
          name?: string;
          role?: string;
          userId?: number;
          forcePasswordChange?: boolean;
          error?: string;
        };
        if (!res.ok) { setError(data.error ?? "Credenciais inválidas"); return; }

        if (data.forcePasswordChange) {
          setPendingToken(data.token!);
          setPendingEmail(data.email!);
          setPendingRole(data.role ?? "");
          setPendingUserId(data.userId ?? null);
          setPendingName(data.name ?? data.email!);
          setScreen("change-password");
          return;
        }

        localStorage.setItem("jwt_token", data.token!);
        localStorage.setItem("jwt_username", data.email!);
        localStorage.setItem("jwt_displayname", data.name ?? data.email!);
        localStorage.setItem("jwt_role", data.role ?? "");

        const redirect = sessionStorage.getItem("redirect_after_login");
        sessionStorage.removeItem("redirect_after_login");
        if (data.role === "platform_admin") {
          setLocation("/admin");
        } else if (redirect && redirect.startsWith("/painel")) {
          setLocation(redirect);
        } else {
          setLocation("/painel");
        }
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function onForgot(values: ForgotForm) {
    setForgotLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email.trim().toLowerCase() }),
      });
      setScreen("forgot-success");
    } catch {
      setScreen("forgot-success");
    } finally {
      setForgotLoading(false);
    }
  }

  async function onChangePassword(values: ChangeForm) {
    if (!pendingUserId) { setError("Erro: usuário não identificado."); return; }
    setChangeLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: pendingUserId,
          currentPassword: form.getValues("password").trim(),
          newPassword: values.newPassword.trim(),
        }),
      });
      const data = await res.json() as { message?: string; error?: string };
      if (!res.ok) { setError(data.error ?? "Erro ao trocar senha."); return; }

      localStorage.setItem("jwt_token", pendingToken!);
      localStorage.setItem("jwt_username", pendingEmail!);
      localStorage.setItem("jwt_displayname", pendingName ?? pendingEmail!);
      localStorage.setItem("jwt_role", pendingRole ?? "");

      const redirect = sessionStorage.getItem("redirect_after_login");
      sessionStorage.removeItem("redirect_after_login");
      if (pendingRole === "platform_admin") {
        setLocation("/admin");
      } else if (redirect && redirect.startsWith("/painel")) {
        setLocation(redirect);
      } else {
        setLocation("/painel");
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setChangeLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-secondary/80 opacity-90" />
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)", backgroundSize: "30px 30px" }} />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <a href="/" className="inline-flex items-center gap-2 mb-6 group">
            <img src="/logo.png" alt="Fretai" className="h-8 w-auto mb-4" />
          </a>

          {screen === "login" && (
            <>
              <h1 className="text-2xl font-bold text-white mb-1">Acesso à Plataforma</h1>
              <p className="text-primary-foreground/60 text-sm">Entre com seu e-mail e senha</p>
            </>
          )}
          {screen === "forgot" && (
            <>
              <h1 className="text-2xl font-bold text-white mb-1">Recuperar Senha</h1>
              <p className="text-primary-foreground/60 text-sm">Informe seu e-mail para receber as instruções</p>
            </>
          )}
          {screen === "forgot-success" && (
            <>
              <h1 className="text-2xl font-bold text-white mb-1">E-mail enviado</h1>
              <p className="text-primary-foreground/60 text-sm">Verifique sua caixa de entrada</p>
            </>
          )}
          {screen === "change-password" && (
            <>
              <h1 className="text-2xl font-bold text-white mb-1">Crie sua senha</h1>
              <p className="text-primary-foreground/60 text-sm">Por segurança, defina uma nova senha para continuar</p>
            </>
          )}
        </div>

        <div className="bg-card rounded-2xl border border-white/10 shadow-2xl p-8">

          {/* Login */}
          {screen === "login" && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-medium">Usuário / E-mail</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input className="pl-9" placeholder="seu@email.com ou admin" autoComplete="username" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-medium">Senha</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            className="pl-9 pr-10"
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            {...field}
                          />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {error && (
                  <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                    <AlertCircle size={15} /><span>{error}</span>
                  </div>
                )}
                <Button type="submit" className="w-full h-11 bg-accent hover:bg-accent/90 text-white font-semibold" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
                <div className="text-center">
                  <button type="button" onClick={() => { setScreen("forgot"); forgotForm.reset(); }} className="text-sm text-muted-foreground hover:text-accent transition-colors">
                    Esqueci minha senha
                  </button>
                </div>
              </form>
            </Form>
          )}

          {/* Troca de senha obrigatória */}
          {screen === "change-password" && (
            <Form {...changeForm}>
              <form onSubmit={changeForm.handleSubmit(onChangePassword)} className="space-y-5">
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700 mb-2">
                  Este é seu primeiro acesso. Defina uma senha pessoal para continuar.
                </div>
                <FormField
                  control={changeForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-medium">Nova senha</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            className="pl-9 pr-10"
                            type={showNewPassword ? "text" : "password"}
                            placeholder="Mínimo 6 caracteres"
                            {...field}
                          />
                          <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                            {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={changeForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-medium">Confirmar senha</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            className="pl-9 pr-10"
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="Repita a nova senha"
                            {...field}
                          />
                          <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                            {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {error && (
                  <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                    <AlertCircle size={15} /><span>{error}</span>
                  </div>
                )}
                <Button type="submit" className="w-full h-11 bg-accent hover:bg-accent/90 text-white font-semibold" disabled={changeLoading}>
                  {changeLoading ? "Salvando..." : "Definir senha e entrar"}
                </Button>
              </form>
            </Form>
          )}

          {/* Recuperar senha */}
          {screen === "forgot" && (
            <Form {...forgotForm}>
              <form onSubmit={forgotForm.handleSubmit(onForgot)} className="space-y-5">
                <FormField
                  control={forgotForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-medium">Seu e-mail</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input className="pl-9" type="email" placeholder="seu@email.com" autoComplete="email" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full h-11 bg-accent hover:bg-accent/90 text-white font-semibold" disabled={forgotLoading}>
                  {forgotLoading ? "Enviando..." : "Enviar instruções"}
                </Button>
                <div className="text-center">
                  <button type="button" onClick={() => setScreen("login")} className="text-sm text-muted-foreground hover:text-accent transition-colors">
                    ← Voltar ao login
                  </button>
                </div>
              </form>
            </Form>
          )}

          {/* Sucesso recuperação */}
          {screen === "forgot-success" && (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <CheckCircle size={28} className="text-green-600" />
              </div>
              <p className="text-sm text-muted-foreground">
                Se o e-mail estiver cadastrado, você receberá as instruções em breve.
              </p>
              <Button variant="outline" className="w-full" onClick={() => setScreen("login")}>
                Voltar ao login
              </Button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-primary-foreground/30 mt-6">
          © 2026 Fretai Inteligência Logística S.A.
        </p>
        <p className="text-center text-xs text-primary-foreground/20 mt-1">
          Acesso restrito a usuários autorizados.
        </p>
      </div>
    </div>
  );
}