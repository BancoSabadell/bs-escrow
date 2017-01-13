pragma solidity ^0.4.2;

contract Ownable {
  bool public stopped;
  address internal owner;

  event SetOwner(address indexed previousOwner, address indexed newOwner);

  function Ownable () {
    owner = msg.sender;
  }

  modifier onlyOwner {
    if (msg.sender != owner) throw;
    _;
  }

  modifier stopInEmergency {
    if (stopped) throw;
    _;
  }

  modifier onlyInEmergency {
    if (!stopped) throw;
    _;
  }

  function transferOwnership(address newOwner) onlyOwner {
    SetOwner(owner, newOwner);
    owner = newOwner;
  }

  // called by the owner on emergency, triggers stopped state
  function emergencyStop() external onlyOwner {
    stopped = true;
  }

  // called by the owner on end of emergency, returns to normal state
  function release() external onlyOwner onlyInEmergency {
    stopped = false;
  }

  function getOwner() returns (address out) {
    return owner;
  }
}
