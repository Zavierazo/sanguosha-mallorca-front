import React from 'react';
import Navbar from '../Navbar';
import { Link } from 'react-router-dom';

const Home = () => {
  const LinkItem = ({ href, children, isInternal = false }: { href: string; children: React.ReactNode; isInternal?: boolean }) => {
    const baseClasses = "block px-4 py-3 rounded-lg transition-all duration-200 hover:translate-x-1";
    const hoverClasses = "text-blue-600 hover:bg-blue-50 hover:font-semibold";
    
    if (isInternal) {
      return (
        <Link to={href} className={`${baseClasses} ${hoverClasses}`}>
          {children}
        </Link>
      );
    }
    
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${baseClasses} ${hoverClasses}`}
      >
        {children}
      </a>
    );
  };

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-5xl mx-auto px-6 py-12">
          {/* Header */}
          <div className="mb-16 text-center">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-3">
              Sanguosha Mallorca
            </h1>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-1 gap-8">
            {/* Card Puntuaciones */}
            <div className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden border-l-4 border-blue-500">
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-8 py-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                  📊 Puntuaciones
                </h2>
              </div>
              <div className="p-8 space-y-2">
                <LinkItem href="https://sanguosha.es/alvaro/ranking">
                  Generador de puntuaciones 2021
                </LinkItem>
                <LinkItem href="/ranking" isInternal>
                  Generador de puntuaciones 2024
                </LinkItem>
                <LinkItem href="https://www.facebook.com/media/set/?set=oa.1748090112371343&type=3">
                  Ranked Season
                </LinkItem>
              </div>
            </div>

            {/* Card Tableau */}
            <div className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden border-l-4 border-purple-500">
              <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-8 py-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                  📈 Tableau
                </h2>
              </div>
              <div className="p-8 space-y-2">
                <LinkItem href="https://public.tableau.com/app/profile/miquel.ferrer.pons/viz/SGSstats/SGSMatchfinder">
                  Buscador de partidas
                </LinkItem>
                <LinkItem href="https://public.tableau.com/app/profile/miquel.ferrer.pons/viz/SGSstats/Niveles?publish=yes">
                  Nivel jugadores (y otras estadísticas en pestaña)
                </LinkItem>
              </div>
            </div>

            {/* Card Reglas */}
            <div className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden border-l-4 border-green-500">
              <div className="bg-gradient-to-r from-green-500 to-green-600 px-8 py-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                  📖 Reglas
                </h2>
              </div>
              <div className="p-8 space-y-2">
                <LinkItem href="/explicación_juego_y_escalado_de_complejidad.pdf">
                  Explicación del juego y escalado de complejidad
                </LinkItem>
                <LinkItem href="/faq.pdf">
                  Reglas
                </LinkItem>
              </div>
            </div>

            {/* Card Eventos */}
            <div className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden border-l-4 border-red-500">
              <div className="bg-gradient-to-r from-red-500 to-red-600 px-8 py-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                  🎮 Eventos
                </h2>
              </div>
              <div className="p-8">
                <iframe 
                  src="https://app.ludoya.com/embed/groups/sanguosha/events?view=LIST&tab=future" 
                  style={{width: '100%', minHeight: '600px', border: 'none'}}
                  loading="lazy" 
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default Home;
