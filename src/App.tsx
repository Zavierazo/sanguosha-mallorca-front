import React from 'react';
import { Route, Routes } from 'react-router-dom';
import './App.css';
import Estadisticas from './Estadisticas';
import NivelJugadores from './Estadisticas/NivelJugadores';
import Home from './Home';
import Ranking from './Ranking';
import Torneos from './Torneos';

function App() {
  return (
    <div id="root" className="App">
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/ranking' element={<Ranking />} />
        <Route path='/estadisticas' element={<Estadisticas />} />
        <Route path='/estadisticas/nivel-jugadores' element={<NivelJugadores />} />
        <Route path='/torneos' element={<Torneos />} />
      </Routes>
    </div>
  );
}

export default App;
