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
          <Link to="/ranking">Ranking</Link>
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
