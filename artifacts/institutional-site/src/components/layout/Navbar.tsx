import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, Hexagon, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "/", label: "Início" },
  { href: "/a-plataforma", label: "A Plataforma" },
  { href: "/solucao-financeira", label: "Solução Financeira" },
  { href: "/estrutura-de-capacidade", label: "Estrutura" },
  { href: "/governanca-e-controle", label: "Governança" },
  { href: "/sobre", label: "Sobre" },
  { href: "/contato", label: "Contato" },
];

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [location] = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setIsOpen(false);
    window.scrollTo(0, 0);
  }, [location]);

  const isDark = !scrolled;

  return (
    <header
      className={`fixed top-0 left-0 right-0 w-full z-50 transition-all duration-300 border-b ${
        scrolled
          ? "bg-background/95 backdrop-blur-md border-border shadow-sm"
          : "bg-primary border-transparent"
      }`}
    >
      {/*
       * ─────────────────────────────────────────────────────────────
       *  DESKTOP  ≥ 1024px  —  navegação horizontal completa
       *  Nunca exibe hambúrguer. Todos os itens visíveis em linha única.
       * ─────────────────────────────────────────────────────────────
       */}
      <div className="hidden lg:flex items-center h-16 w-full px-8 xl:px-16 2xl:px-24 max-w-screen-2xl mx-auto">

        {/* Coluna 1 — Logo (esquerda) */}
        <img src={isDark ? "/logo.png" : "/logo2.png"} alt="Fretai" className="h-8 w-auto" />

        {/* Coluna 2 — Itens de navegação (centro, flex-1) */}
        <nav className="flex items-center gap-0.5 flex-1 justify-center">
          {NAV_LINKS.map((link) => {
            const isActive = location === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`
                  relative px-3.5 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all duration-150
                  ${isActive
                    ? isDark
                      ? "text-white bg-white/10"
                      : "text-accent bg-accent/10"
                    : isDark
                      ? "text-white/70 hover:text-white hover:bg-white/8"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }
                `}
              >
                {link.label}
                {isActive && (
                  <span
                    className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full bg-accent"
                    aria-hidden="true"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Coluna 3 — Login + CTA (direita) */}
        <div className="flex items-center gap-2 shrink-0 ml-8">
          <Link href="/login">
            <Button
              variant="ghost"
              size="sm"
              className={`gap-1.5 text-sm font-medium ${
                isDark
                  ? "text-white/60 hover:text-white hover:bg-white/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <LogIn size={14} />
              Login
            </Button>
          </Link>
          <Link href="/contato">
            <Button
              size="sm"
              className="bg-accent hover:bg-accent/90 text-white font-semibold rounded-full px-5 shadow-md shadow-accent/25 whitespace-nowrap"
            >
              Solicitar Demo
            </Button>
          </Link>
        </div>
      </div>

      {/*
       * ─────────────────────────────────────────────────────────────
       *  MOBILE / TABLET  < 1024px  —  hambúrguer recolhível
       *  Este bloco NÃO É RENDERIZADO em telas ≥ 1024px (lg:hidden).
       * ─────────────────────────────────────────────────────────────
       */}
      <div className="lg:hidden flex items-center justify-between h-16 px-4">
        <Link href="/" className="flex items-center gap-2 group">
          <img src={isDark ? "/logo.png" : "/logo2.png"} alt="Fretai" className="h-8 w-auto" />
        </Link>

        {/* Hambúrguer — APENAS mobile/tablet */}
        <button
          className={`p-2 rounded-md transition-colors ${
            isDark ? "text-white hover:bg-white/10" : "text-foreground hover:bg-muted"
          }`}
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={isOpen}
        >
          {isOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Menu mobile expandido */}
      {isOpen && (
        <div className="lg:hidden absolute top-16 left-0 right-0 w-full bg-background border-b border-border shadow-2xl z-50 flex flex-col p-4 gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium px-3 py-2.5 rounded-lg transition-colors ${
                location === link.href
                  ? "bg-accent/10 text-accent"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <div className="border-t border-border mt-3 pt-3 flex flex-col gap-2">
            <Link href="/login" className="w-full">
              <Button variant="outline" className="w-full gap-2 justify-center">
                <LogIn size={15} />
                Login
              </Button>
            </Link>
            <Link href="/contato" className="w-full">
              <Button className="w-full bg-accent hover:bg-accent/90 text-white font-semibold justify-center rounded-full">
                Solicitar Demo
              </Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
