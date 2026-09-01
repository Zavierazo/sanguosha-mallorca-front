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
      </ul>
    </nav>
  )
}

export default Navbar;
