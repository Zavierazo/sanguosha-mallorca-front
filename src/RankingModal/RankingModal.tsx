import { useEffect } from 'react';
import PropTypes from 'prop-types';

const RankingModal = () => {

  useEffect(() => {
    console.log(`RankingModal mounted`)
  }, [])

  return (
    <div className="RankingModal-component">
      Test content
    </div>
  )
}

RankingModal.propTypes = {
  // bla: PropTypes.string,
};

RankingModal.defaultProps = {
  // bla: 'test',
};

export default RankingModal;
