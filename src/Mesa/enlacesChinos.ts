export interface EnlaceChino {
  texto: "Moegirl" | "Moegirl UK" | "Biwiki";
  url: string;
}

const basesBiwikiPorServidor: Record<string, string> = {
  HL: "https://wiki.biligame.com/sgs/",
  "手机": "https://wiki.biligame.com/msgs/",
  OL: "https://wiki.biligame.com/sgsol/",
  "欢乐杀": "https://wiki.biligame.com/hsgs/",
};

export function crearEnlacesChinos(
  nombreDorso: string | null | undefined,
  servidor: string | null | undefined
): EnlaceChino[] {
  const nombre = nombreDorso?.trim();
  if (!nombre) return [];

  const nombreCodificado = encodeURIComponent(nombre);
  const enlaces: EnlaceChino[] = [
    {
      texto: "Moegirl",
      url: `https://zh.moegirl.org.cn/%E4%B8%89%E5%9B%BD%E6%9D%80:${nombreCodificado}`,
    },
    {
      texto: "Moegirl UK",
      url: `https://moegirl.uk/%E4%B8%89%E5%9B%BD%E6%9D%80:${nombreCodificado}`,
    },
  ];
  const baseBiwiki = servidor ? basesBiwikiPorServidor[servidor.trim()] : undefined;
  if (baseBiwiki) {
    enlaces.push({
      texto: "Biwiki",
      url: `${baseBiwiki}${nombreCodificado}`,
    });
  }
  return enlaces;
}
