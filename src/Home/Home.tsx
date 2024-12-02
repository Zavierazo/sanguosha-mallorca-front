import React from 'react';
import Navbar from '../Navbar';

const Home = () => {

  return (
    <>
      <Navbar />
      <h1 className="text-3xl font-bold underline m-6">
        Welcome!
      </h1>
    </>
  )
}

Home.propTypes = {
  // bla: PropTypes.string,
};

Home.defaultProps = {
  // bla: 'test',
};

export default Home;
