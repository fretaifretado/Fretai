import DashboardLayout from "./layout";
import { Radio } from "lucide-react";
import { useEffect, useRef } from "react";

const VANS = [
  { id: 1, nome: "Van 1", placa: "HBK7190" },
  { id: 2, nome: "Van 2", placa: "MNP3421" },
  { id: 3, nome: "Van 3", placa: "QRS8834" },
  { id: 4, nome: "Van 4", placa: "TUV2210" },
  { id: 5, nome: "Van 5", placa: "XYZ5567" },
];

const TRAJETOS = [
  { origem: [-22.7600, -47.1500], destino: [-22.7700, -47.1350] },
  { origem: [-22.7550, -47.1600], destino: [-22.7750, -47.1400] },
  { origem: [-22.7500, -47.1550], destino: [-22.7650, -47.1300] },
  { origem: [-22.7730, -47.1580], destino: [-22.7570, -47.1420] },
  { origem: [-22.7630, -47.1650], destino: [-22.7710, -47.1380] },
];

async function buscarRota(origem: number[], destino: number[]): Promise<number[][]> {
  const url = `https://router.project-osrm.org/route/v1/driving/${origem[1]},${origem[0]};${destino[1]},${destino[0]}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.routes && data.routes[0]) {
    return data.routes[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
  }
  return [];
}

function lerp(a: number[], b: number[], t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// Distância em metros entre dois pontos lat/lng
function distancia(a: number[], b: number[]): number {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) *
      Math.cos((b[0] * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export default function RotaAoVivoPage() {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const animFrames: number[] = [];
    let map: any = null;
    let cancelled = false;

    // Carrega o CSS do Leaflet apenas uma vez (mantido no <head> entre montagens)
    if (!document.querySelector('link[data-leaflet="css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.setAttribute("data-leaflet", "css");
      document.head.appendChild(link);
    }

    const initMap = async () => {
      const L = (window as any).L;
      if (cancelled || !L || !mapRef.current) return;

      map = L.map(mapRef.current).setView([-22.7649, -47.1536], 14);

      // Garante o cálculo correto do tamanho após a montagem
      setTimeout(() => { if (map) map.invalidateSize(); }, 0);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20,
      }).addTo(map);

      const makeIcon = (nome: string) =>
        L.divIcon({
          className: "",
          html: `
            <div style="width:38px;height:38px;border-radius:50%;background:#1f2937;border:2.5px solid #1f2937;overflow:hidden;box-shadow:0 3px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
                <img src="/favicon.png" style="width:28px;height:28px;object-fit:contain;" />
            </div>
          `,
          iconAnchor: [19, 52],
          popupAnchor: [0, -55],
        });

      const rotas = await Promise.all(
        TRAJETOS.map((t) => buscarRota(t.origem, t.destino))
      );

      // Velocidade constante: 40 km/h em metros por ms
      const VELOCIDADE_MS = 40000 / 3600000;

      rotas.forEach((rota, i) => {
        if (rota.length < 2) return;

        const van = VANS[i];

        L.polyline(rota, {
          color: "#3b82f6",
          weight: 3,
          opacity: 0.3,
          dashArray: "6 6",
        }).addTo(map);

        const marker = L.marker(rota[0] as [number, number], {
          icon: makeIcon(van.nome),
        })
          .addTo(map)
          .bindPopup(`
            <div style="font-family:Inter,sans-serif;min-width:140px">
              <div style="font-weight:700;font-size:13px;margin-bottom:4px">${van.nome}</div>
              <div style="font-size:12px;color:#6b7280">Placa: <b>${van.placa}</b></div>
              <div style="font-size:12px;color:#16a34a;margin-top:4px">● Em rota</div>
            </div>
          `);

        // Pré-calcula distância de cada segmento
        const distancias = rota.slice(0, -1).map((p, j) => distancia(p, rota[j + 1]));

        let segmentoAtual = Math.floor((rota.length / VANS.length) * i) % (rota.length - 1);
        let direcao = 1;
        let distPercorrida = 0;
        let lastTime: number | null = null;

        function animar(timestamp: number) {
          if (!lastTime) lastTime = timestamp;
          const delta = timestamp - lastTime;
          lastTime = timestamp;

          const distSeg = distancias[segmentoAtual] || 1;
          distPercorrida += VELOCIDADE_MS * delta;

          // Avança segmentos se passou da distância do segmento atual
          while (distPercorrida >= distSeg) {
            distPercorrida -= distSeg;
            segmentoAtual += direcao;

            if (segmentoAtual >= rota.length - 1) {
              segmentoAtual = rota.length - 2;
              direcao = -1;
            } else if (segmentoAtual <= 0) {
              segmentoAtual = 1;
              direcao = 1;
            }
          }

          const t = distPercorrida / (distancias[segmentoAtual] || 1);
          const pontoA = rota[segmentoAtual];
          const pontoB = rota[segmentoAtual + direcao];

          if (pontoA && pontoB) {
            marker.setLatLng(lerp(pontoA, pontoB, t));
          }

          const id = requestAnimationFrame(animar);
          animFrames.push(id);
        }

        const id = requestAnimationFrame(animar);
        animFrames.push(id);
      });
    };

    // Garante que o Leaflet esteja carregado, chamando o callback quando pronto.
    const ensureLeaflet = (cb: () => void) => {
      if ((window as any).L) { cb(); return; }
      let script = document.querySelector<HTMLScriptElement>('script[data-leaflet="js"]');
      if (!script) {
        script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.setAttribute("data-leaflet", "js");
        document.head.appendChild(script);
      }
      script.addEventListener("load", cb, { once: true });
    };

    // O DashboardLayout só renderiza os filhos depois de autenticar (authed),
    // então o <div> do mapa pode ainda não existir quando o efeito roda.
    // Aguardamos o container aparecer antes de inicializar.
    const start = () => {
      if (cancelled) return;
      if (!mapRef.current) {
        requestAnimationFrame(start);
        return;
      }
      ensureLeaflet(() => { if (!cancelled) initMap(); });
    };

    start();

    return () => {
      cancelled = true;
      animFrames.forEach(cancelAnimationFrame);
      if (map) {
        map.remove();
        map = null;
      }
    };
  }, []);

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-5xl">
        <div className="flex items-center gap-2 mb-6">
          <Radio size={18} className="text-accent" />
          <h1 className="text-xl font-bold text-foreground">Rota ao Vivo</h1>
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
            5 veículos ativos
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Trajetos ao vivo
          </span>
        </div>

        <div ref={mapRef} className="rounded-xl overflow-hidden border shadow-sm" style={{ height: "520px" }} />

        <div className="flex flex-wrap gap-4 mt-4">
          {[
            { color: "bg-green-500", label: "Em rota" },
            { color: "bg-blue-500", label: "No ponto de embarque" },
            { color: "bg-amber-500", label: "Com atraso" },
            { color: "bg-gray-400", label: "Encerrado" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
              {item.label}
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}