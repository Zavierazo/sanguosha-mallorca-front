import React from 'react';
import Navbar from '../Navbar';
import { Link } from 'react-router-dom';

const Home = () => {
  return (
    <>
      <Navbar />
      <h1 className="text-3xl font-bold underline m-6">
        Bienvenido a Sanguosha Mallorca
      </h1>
      <div className="m-6 space-y-8">
        {/* Categoría Puntuaciones */}
        <div>
          <div className="font-semibold text-lg mb-2">Puntuaciones</div>
          <ul className="ml-6 list-disc list-inside space-y-1">
            <li>
              <a
                href="https://sanguosha.es/alvaro/ranking"
                target="_blank"
                rel="noopener noreferrer"
              >
                Generador de puntuaciones 2021
              </a>
            </li>
            <li>
              <Link to="/ranking">Generador de puntuaciones 2024</Link>
            </li>
            <li>
              <a
                href="https://www.facebook.com/media/set/?set=oa.1748090112371343&type=3"
                target="_blank"
                rel="noopener noreferrer"
              >
                Ranked Season
              </a>
            </li>
          </ul>
        </div>
        {/* Categoría Tableau */}
        <div>
          <div className="font-semibold text-lg mb-2">Tableau</div>
          <ul className="ml-6 list-disc list-inside space-y-1">
            <li>
              <a
                href="https://public.tableau.com/app/profile/miquel.ferrer.pons/viz/SGSstats/SGSMatchfinder"
                target="_blank"
                rel="noopener noreferrer"
              >
                Buscador de partidas
              </a>
            </li>
            <li>
              <a
                href="https://public.tableau.com/app/profile/miquel.ferrer.pons/viz/SGSstats/Niveles?publish=yes"
                target="_blank"
                rel="noopener noreferrer"
              >
                Nivel jugadores (y otras estadísticas en pestaña)
              </a>
            </li>
          </ul>
        </div>
        {/* Categoría Reglas */}
        <div>
          <div className="font-semibold text-lg mb-2">Reglas</div>
          <ul className="ml-6 list-disc list-inside space-y-1">
            <li>
              <a
                href="/explicación_juego_y_escalado_de_complejidad_v12.2"
                target="_blank"
                rel="noopener noreferrer"
              >
                Explicación del juego y escalado de complejidad (v. 12.2)
              </a>
            </li>
            <li>
              <a
                href="/faq_v110.6"
                target="_blank"
                rel="noopener noreferrer"
              >
                Reglas (v. 110.6)
              </a>
            </li>
          </ul>
        </div>
      </div>
    </>
  )
}

export default Home;
