pragma solidity 0.4.24;
pragma experimental "v0.5.0";

import "zos-lib/contracts/migrations/Initializable.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "./SpaceToken.sol";
import "./SplitMerge.sol";


contract PlotManager is Initializable, Ownable {
  enum ApplicationStatuses { NOT_EXISTS, NEW, SUBMITTED, APPROVED, REJECTED, CONSIDERATION, DISASSEMBLED, REFUNDED, COMPLETED, CLOSED }

  event LogApplicationStatusChanged(bytes32 application, ApplicationStatuses status);
  event LogNewApplication(bytes32 id, address applicant);

  struct Application {
    bytes32 id;
    address applicant;
    address validator;
    bytes32 credentialsHash;
    bytes32 ledgerIdentifier;
    uint256 packageTokenId;
    uint256 fee;
    bool feePaid;
    uint8 precision;
    bytes2 country;
    uint256[] vertices;
    ApplicationStatuses status;
  }

  struct Validator {
    bytes32 name;
    bytes2 country;
    bool active;
  }

  uint256 public validationFeeInEth;
  uint256 galtSpaceEthStake;

  mapping(bytes32 => Application) public applications;
  mapping(address => Validator) public validators;
  bytes32[] applicationsArray;
  mapping(address => bytes32[]) public applicationsByAddresses;
  // WARNING: we do not remove validators from validatorsArray,
  // so do not rely on this variable to verify whether validator
  // exists or not.
  address[] validatorsArray;

  SpaceToken public spaceToken;
  SplitMerge public splitMerge;

  constructor () public {}

  function initialize(
    uint256 _validationFeeInEth,
    uint256 _galtSpaceEthStake,
    SpaceToken _spaceToken,
    SplitMerge _splitMerge
  )
    public
    isInitializer
  {
    owner = msg.sender;
    spaceToken = _spaceToken;
    splitMerge = _splitMerge;
    validationFeeInEth = _validationFeeInEth;
    galtSpaceEthStake = _galtSpaceEthStake;
  }

  modifier onlyApplicant(bytes32 _aId) {
    Application storage a = applications[_aId];

    require(a.applicant == msg.sender, "Not valid applicant");
    require(splitMerge != address(0), "SplitMerge address not set");

    _;
  }

  modifier onlyValidator() {
    require(validators[msg.sender].active == true, "Not active validator");
    _;
  }

  function isValidator(address account) public view returns (bool) {
    return validators[account].active == true;
  }

  function getValidator(
    address validator
  )
    public
    view
    returns (
      bytes32 name,
      bytes2 country,
      bool active
    )
  {
    Validator storage v = validators[validator];

    return (
      v.name,
      v.country,
      v.active
    );
  }

  function addValidator(address _validator, bytes32 _name, bytes2 _country) public onlyOwner {
    require(_validator != address(0), "Missing validator");
    require(_country != 0x0, "Missing country");

    validators[_validator] = Validator({ name: _name, country: _country, active: true });
    validatorsArray.push(_validator);
  }

  function removeValidator(address _validator) public onlyOwner {
    require(_validator != address(0), "Missing validator");

    validators[_validator].active = false;
  }

  function applyForPlotOwnership(
    uint256[] _vertices,
    uint256 _baseGeohash,
    bytes32 _credentialsHash,
    bytes32 _ledgerIdentifier,
    bytes2 _country,
    uint8 _precision
  )
    public
    payable
    returns (bytes32)
  {
    require(_precision > 5, "Precision should be greater than 5");
    require(_vertices.length >= 3, "Number of vertices should be equal or greater than 3");
    require(_vertices.length < 51, "Number of vertices should be equal or less than 50");
    require(msg.value == validationFeeInEth, "Incorrect fee passed in");

    for (uint8 i = 0; i < _vertices.length; i++) {
      require(_vertices[i] > 0, "Vertex should not be zero");
    }

    Application memory a;
    bytes32 _id = keccak256(abi.encodePacked(_vertices[0], _vertices[1], _credentialsHash));

    a.status = ApplicationStatuses.NEW;
    a.id = _id;
    a.applicant = msg.sender;
    a.fee = msg.value;
    a.vertices = _vertices;
    a.country = _country;
    a.credentialsHash = _credentialsHash;
    a.ledgerIdentifier = _ledgerIdentifier;
    a.precision = _precision;

    uint256 geohashTokenId = spaceToken.mintGeohash(address(this), _baseGeohash);
    a.packageTokenId = splitMerge.initPackage(geohashTokenId);

    applications[_id] = a;
    applicationsArray.push(_id);
    applicationsByAddresses[msg.sender].push(_id);

    emit LogNewApplication(_id, msg.sender);
    emit LogApplicationStatusChanged(_id, ApplicationStatuses.NEW);

    return _id;
  }

  function addGeohashesToApplication(
    bytes32 _aId,
    uint256[] _geohashes,
    uint256[] _neighborsGeohashTokens,
    bytes2[] _directions
  )
    public
    onlyApplicant(_aId)
  {
    Application storage a = applications[_aId];
    require(a.status == ApplicationStatuses.NEW || a.status == ApplicationStatuses.REJECTED,
      "Application status should be NEW for this operation.");

    for (uint8 i = 0; i < _geohashes.length; i++) {
      uint256 geohashTokenId = _geohashes[i] ^ uint256(spaceToken.GEOHASH_MASK());
      if (spaceToken.exists(geohashTokenId)) {
        require(spaceToken.ownerOf(geohashTokenId) == address(this),
          "Existing geohash token should belongs to PlotManager contract");
      } else {
        spaceToken.mintGeohash(address(this), _geohashes[i]);
      }

      _geohashes[i] = geohashTokenId;
    }

    splitMerge.addGeohashesToPackage(a.packageTokenId, _geohashes, _neighborsGeohashTokens, _directions);
  }

  function submitApplication(bytes32 _aId) public onlyApplicant(_aId) {
    Application storage a = applications[_aId];

    require(a.status == ApplicationStatuses.NEW, "Application status should be NEW");

    a.status = ApplicationStatuses.SUBMITTED;
    emit LogApplicationStatusChanged(_aId, ApplicationStatuses.SUBMITTED);
  }

  function lockApplicationForReview(bytes32 _aId) public onlyValidator {
    Application storage a = applications[_aId];
    require(a.status == ApplicationStatuses.SUBMITTED, "Application status should be SUBMITTED");

    a.status = ApplicationStatuses.CONSIDERATION;
    emit LogApplicationStatusChanged(_aId, ApplicationStatuses.CONSIDERATION);
  }

  function unlockApplication(bytes32 _aId) public onlyOwner {
    Application storage a = applications[_aId];
    require(a.status == ApplicationStatuses.CONSIDERATION, "Application status should be CONSIDERATION");

    a.status = ApplicationStatuses.SUBMITTED;
    emit LogApplicationStatusChanged(_aId, ApplicationStatuses.SUBMITTED);
  }

  function validateApplication(bytes32 _aId, bool _approve) public onlyValidator {
    Application storage a = applications[_aId];

    require(a.status == ApplicationStatuses.SUBMITTED, "Application status should be SUBMITTED");

    if (_approve) {
      a.status = ApplicationStatuses.APPROVED;
      emit LogApplicationStatusChanged(_aId, ApplicationStatuses.APPROVED);
    } else {
      a.status = ApplicationStatuses.REJECTED;
      emit LogApplicationStatusChanged(_aId, ApplicationStatuses.REJECTED);
    }
  }

  function claimFee(bytes32 _aId) public onlyValidator {
    Application storage a = applications[_aId];

    require(
      a.status == ApplicationStatuses.APPROVED || a.status == ApplicationStatuses.REJECTED,
      "Application status should be ether APPROVED or REJECTED");
    require(a.feePaid == false, "Fee already paid");

    a.feePaid = true;

    msg.sender.transfer(a.fee);
  }

  function isCredentialsHashValid(
    bytes32 _id,
    bytes32 _hash
  )
    public
    view
    returns (bool)
  {
    return (_hash == applications[_id].credentialsHash);
  }

  function getApplicationById(
    bytes32 _id
  )
    public
    view
    returns (
      address applicant,
      uint256[] vertices,
      uint256 packageTokenId,
      bytes32 credentiaslHash,
      uint256 fee,
      ApplicationStatuses status,
      bool feePaid,
      uint8 precision,
      bytes2 country,
      bytes32 ledgerIdentifier
    )
  {
    require(applications[_id].status != ApplicationStatuses.NOT_EXISTS, "Application doesn't exist");

    Application storage m = applications[_id];

    return (
      m.applicant,
      m.vertices,
      m.packageTokenId,
      m.credentialsHash,
      m.fee,
      m.status,
      m.feePaid,
      m.precision,
      m.country,
      m.ledgerIdentifier
    );
  }

  function getApplicationsByAddress(address applicant) external returns (bytes32[]) {
    return applicationsByAddresses[applicant];
  }
}
