import React from 'react';
import { useEffect } from 'react';
import { Link } from "react-router-dom";

const Navbar = () => {

  useEffect(() => {
    console.log(`Navbar mounted`)
  }, [])

  return (
    <nav>
      <ul>
        <li>
          <Link to="/">Home</Link>
        </li>
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
      </ul>
    </nav>
  )
}

Navbar.propTypes = {
  // bla: PropTypes.string,
};

Navbar.defaultProps = {
  // bla: 'test',
};

export default Navbar;
