// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

contract MyProxy is ERC1967Proxy {
    constructor(address _logic, bytes memory _data) ERC1967Proxy(_logic, _data) {
        _changeAdmin(msg.sender);
    }

    function upgrade(address _logic, bytes memory _data) external {
        require(_getAdmin() == msg.sender, "not admin");
        _upgradeToAndCall(_logic, _data, false);
    }
}

contract MyFactory {
    function deploy(address _implementation, bytes memory _initializer) external {
        new MyProxy(_implementation, _initializer);
    }
}

contract MyNFT is ERC721Upgradeable {
    function initialize(string memory name, string memory sym) initializer public {
        __ERC721_init(name, sym);
    }

    function mint(uint256 tokenId) external {
        _mint(msg.sender, tokenId);
    }

    function _baseURI() internal view override returns (string memory) {
        return "ipfs://";
    }
}
