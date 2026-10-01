import React, { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import './App.css';
import Estadisticas from './Estadisticas';
import NivelJugadores from './Estadisticas/NivelJugadores';
import PartidasJugadas from './Estadisticas/PartidasJugadas/PartidasJugadas';
import Home from './Home';
import Ranking from './Ranking';
import Torneos from './Torneos';

// Carga diferida: es la única página con gráficos, y @mui/x-charts no tiene por
// qué viajar en el bundle principal (que ya ronda 1,5 MB) para quien sólo va a
// apuntar una partida.
const Espia = lazy(() => import('./Estadisticas/Espia/Espia'));
const Bandos = lazy(() => import('./Estadisticas/Bandos/Bandos'));

const cargandoGraficos = (
  <p className="py-12 text-center text-slate-500">Cargando…</p>
);

function App() {
  return (
    <div id="root" className="App">
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/ranking' element={<Ranking />} />
        <Route path='/estadisticas' element={<Estadisticas />} />
        <Route path='/estadisticas/nivel-jugadores' element={<NivelJugadores />} />
        <Route path='/estadisticas/partidas' element={<PartidasJugadas />} />
        <Route
          path='/estadisticas/espia'
          element={
            <Suspense fallback={cargandoGraficos}>
              <Espia />
            </Suspense>
          }
        />
        <Route
          path='/estadisticas/bandos'
          element={
            <Suspense fallback={cargandoGraficos}>
              <Bandos />
            </Suspense>
          }
        />
        <Route path='/torneos' element={<Torneos />} />
      </Routes>
    </div>
  );
}

export default App;
