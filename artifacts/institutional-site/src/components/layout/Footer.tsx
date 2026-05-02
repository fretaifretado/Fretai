import { Link } from "wouter";
import { Hexagon, Mail, MapPin, Phone } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-primary text-primary-foreground pt-16 pb-8 border-t border-white/10">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div className="col-span-1 md:col-span-1">
            <img src="/logo.png" alt="Fretai" className="h-8 w-auto mb-4" />
            <p className="text-primary-foreground/70 text-sm mb-6 max-w-sm">
              Plataforma de Inteligência Artificial aplicada à logística industrial. Transformamos o transporte fretado de custo fixo em custo variável controlado com IA.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4">Plataforma</h3>
            <ul className="space-y-3">
              <li><Link href="/a-plataforma" className="text-primary-foreground/70 hover:text-accent transition-colors text-sm">Tecnologia Core</Link></li>
              <li><Link href="/solucao-financeira" className="text-primary-foreground/70 hover:text-accent transition-colors text-sm">Inteligência Financeira</Link></li>
              <li><Link href="/estrutura-de-capacidade" className="text-primary-foreground/70 hover:text-accent transition-colors text-sm">Estrutura</Link></li>
              <li><Link href="/governanca-e-controle" className="text-primary-foreground/70 hover:text-accent transition-colors text-sm">Governança Corporativa</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4">Empresa</h3>
            <ul className="space-y-3">
              <li><Link href="/sobre" className="text-primary-foreground/70 hover:text-accent transition-colors text-sm">Sobre Nós</Link></li>
              <li><Link href="/contato" className="text-primary-foreground/70 hover:text-accent transition-colors text-sm">Contato</Link></li>
              <li><a href="#" className="text-primary-foreground/70 hover:text-accent transition-colors text-sm">Carreiras</a></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4">Contato</h3>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-primary-foreground/70 text-sm">
                <Mail size={16} className="text-accent" />
                comercial@fretai.com.br
              </li>
              <li className="flex items-start gap-3 text-primary-foreground/70 text-sm">
                <MapPin size={16} className="text-accent shrink-0 mt-0.5" />
                Minas Gerais, Brasil
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-primary-foreground/50 text-sm">
            &copy; {new Date().getFullYear()} Fretai Inteligência Logística S.A. Todos os direitos reservados.
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-primary-foreground/50 hover:text-white text-sm">Termos de Uso</a>
            <a href="#" className="text-primary-foreground/50 hover:text-white text-sm">Privacidade</a>
            <a href="#" className="text-primary-foreground/50 hover:text-white text-sm">Segurança de Dados</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
