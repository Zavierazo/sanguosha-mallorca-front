import React from 'react';
import { Route, Routes } from 'react-router-dom';
import './App.css';
import Home from './Home';
import Ranking from './Ranking';

function App() {
  return (
    <div id="root" className="App">
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/ranking' element={<Ranking />} />
      </Routes>
    </div>
  );
}

export default App;
