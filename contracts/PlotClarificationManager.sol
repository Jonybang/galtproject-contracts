pragma solidity 0.4.24;
pragma experimental "v0.5.0";

import "zos-lib/contracts/migrations/Initializable.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "./SpaceToken.sol";
import "./SplitMerge.sol";
import "./Validators.sol";

contract PlotClarificationManager is Initializable, Ownable {
  using SafeMath for uint256;

  // 'PlotClarificationManager' hash
  bytes32 public constant APPLICATION_TYPE = 0x6f7c49efa4ebd19424a5018830e177875fd96b20c1ae22bc5eb7be4ac691e7b7;

  // 'clarification pusher' bytes32 representation
  bytes32 public constant PUSHER_ROLE = 0x636c6172696669636174696f6e20707573686572000000000000000000000000;

  enum ApplicationStatus {
    NOT_EXISTS,
    NEW,
    VALUATION_REQUIRED,
    VALUATION,
    PAYMENT_REQUIRED,
    SUBMITTED,
    APPROVED,
    REVERTED,
    PACKED
  }

  enum ValidationStatus {
    INTACT,
    LOCKED,
    APPROVED,
    REVERTED
  }

  enum PaymentMethod {
    NONE,
    ETH_ONLY,
    GALT_ONLY,
    ETH_AND_GALT
  }

  enum Currency {
    ETH,
    GALT
  }

  event LogApplicationStatusChanged(bytes32 applicationId, ApplicationStatus status);
  event LogValidationStatusChanged(bytes32 applicationId, bytes32 role, ValidationStatus status);
  event LogNewApplication(bytes32 id, address applicant);

  struct Application {
    bytes32 id;
    address applicant;

    bytes32 credentialsHash;
    bytes32 ledgerIdentifier;
    uint256 packageTokenId;

    uint256 validatorsReward;
    uint256 galtSpaceReward;
    uint256 gasDeposit;
    bool galtSpaceRewardPaidOut;

    uint8 precision;
    bytes2 country;
    Currency currency;
    ApplicationStatus status;

    bytes32[] assignedRoles;

    // TODO: combine into role struct
    mapping(bytes32 => uint256) assignedRewards;
    mapping(bytes32 => bool) roleRewardPaidOut;
    mapping(bytes32 => string) roleMessages;
    mapping(bytes32 => address) roleAddresses;
    mapping(address => bytes32) addressRoles;
    mapping(bytes32 => ValidationStatus) validationStatus;
  }

  mapping(bytes32 => Application) public applications;
  mapping(address => bytes32[]) public applicationsByAddresses;
  bytes32[] private applicationsArray;
  // WARNING: we do not remove applications from validator's list,
  // so do not rely on this variable to verify whether validator
  // exists or not.
  mapping(address => bytes32[]) public applicationsByValidator;

  PaymentMethod public paymentMethod;
  uint256 public minimalApplicationFeeInEth;
  uint256 public minimalApplicationFeeInGalt;
  uint256 public galtSpaceEthShare;
  uint256 public galtSpaceGaltShare;
  address private galtSpaceRewardsAddress;


  SpaceToken public spaceToken;
  SplitMerge public splitMerge;
  Validators public validators;
  ERC20 public galtToken;

  constructor () public {}

  modifier validatorsReady() {
    // require(validators.isApplicationTypeReady(APPLICATION_TYPE), "Roles list not complete");

    _;
  }

  modifier onlyPusherRole() {
    require(validators.hasRole(msg.sender, PUSHER_ROLE), "Validator doesn't qualify for this action");
    validators.ensureValidatorActive(msg.sender);

    _;
  }

  modifier onlyApplicant(bytes32 _aId) {
    Application storage a = applications[_aId];

    require(a.applicant == msg.sender, "Applicant invalid");

    _;
  }


  function initialize(
    SpaceToken _spaceToken,
    SplitMerge _splitMerge,
    Validators _validators,
    ERC20 _galtToken,
    address _galtSpaceRewardsAddress
  )
    public
    isInitializer
  {
    owner = msg.sender;

    spaceToken = _spaceToken;
    splitMerge = _splitMerge;
    validators = _validators;
    galtToken = _galtToken;
    galtSpaceRewardsAddress = _galtSpaceRewardsAddress;

    // Default values for revenue shares and application fees
    // Override them using one of the corresponding setters
    minimalApplicationFeeInEth = 1;
    minimalApplicationFeeInGalt = 10;
    galtSpaceEthShare = 33;
    galtSpaceGaltShare = 33;
    paymentMethod = PaymentMethod.ETH_AND_GALT;
  }

  function setGaltSpaceRewardsAddress(address _newAddress) public onlyOwner {
    galtSpaceRewardsAddress = _newAddress;
  }

  function setPaymentMethod(PaymentMethod _newMethod) public onlyOwner {
    paymentMethod = _newMethod;
  }

  function setMinimalApplicationFeeInEth(uint256 _newFee) public onlyOwner {
    minimalApplicationFeeInEth = _newFee;
  }

  function setMinimalApplicationFeeInGalt(uint256 _newFee) public onlyOwner {
    minimalApplicationFeeInGalt = _newFee;
  }

  function setGaltSpaceEthShare(uint256 _newShare) public onlyOwner {
    require(_newShare >= 1, "Percent value should be greater or equal to 1");
    require(_newShare <= 100, "Percent value should be greater or equal to 100");

    galtSpaceEthShare = _newShare;
  }

  function setGaltSpaceGaltShare(uint256 _newShare) public onlyOwner {
    require(_newShare >= 1, "Percent value should be greater or equal to 1");
    require(_newShare <= 100, "Percent value should be greater or equal to 100");

    galtSpaceGaltShare = _newShare;
  }


  function applyForPlotOwnership(
    uint256 _packageTokenId,
    bytes32 _credentialsHash,
    bytes32 _ledgerIdentifier,
    bytes2 _country,
    uint8 _precision
  )
    public
    validatorsReady
    returns (bytes32)
  {
    require(_precision > 5, "Precision should be greater than 5");
    require(spaceToken.ownerOf(_packageTokenId) == msg.sender, "Sender should own the provided token");
    // TODO: require owner is sender

    spaceToken.transferFrom(msg.sender, address(this), _packageTokenId);
    // TODO: transfer space token here

    Application memory a;
    bytes32 _id = keccak256(
      abi.encodePacked(
        _packageTokenId,
        _credentialsHash,
        blockhash(block.number)
      )
    );

    require(applications[_id].status == ApplicationStatus.NOT_EXISTS, "Application already exists");

    a.status = ApplicationStatus.NEW;
    a.id = _id;
    a.applicant = msg.sender;

    a.packageTokenId = _packageTokenId;
    a.country = _country;
    a.credentialsHash = _credentialsHash;
    a.ledgerIdentifier = _ledgerIdentifier;
    a.precision = _precision;

    applications[_id] = a;
    applicationsArray.push(_id);
    applicationsByAddresses[msg.sender].push(_id);

    emit LogNewApplication(_id, msg.sender);
    emit LogApplicationStatusChanged(_id, ApplicationStatus.NEW);

    return _id;
  }

  function submitApplicationForValuation(bytes32 _aId) external onlyApplicant(_aId) {
    Application storage a = applications[_aId];

    require(a.status == ApplicationStatus.NEW, "ApplicationStatus should be NEW");

    changeApplicationStatus(a, ApplicationStatus.VALUATION_REQUIRED);

  }

  function lockApplicationForValuation(bytes32 _aId) external onlyPusherRole {
    Application storage a = applications[_aId];

    require(a.status == ApplicationStatus.VALUATION_REQUIRED, "ApplicationStatus should be VALUATION_REQUIRED");

    changeApplicationStatus(a, ApplicationStatus.VALUATION);
  }

  function valuateGasDeposit(bytes32 _aId, uint256 _gasDeposit) external onlyPusherRole {
    Application storage a = applications[_aId];

    require(a.status == ApplicationStatus.VALUATION, "ApplicationStatus should be VALUATION");

    a.gasDeposit = _gasDeposit;
    changeApplicationStatus(a, ApplicationStatus.PAYMENT_REQUIRED);
  }

  function getApplicationById(
    bytes32 _id
  )
    public
    view
    returns (
      ApplicationStatus status,
      Currency currency,
      address applicant,
      uint256 packageTokenId,
      bytes32[] assignedValidatorRoles,
      uint256 gasDeposit,
      uint256 validatorsReward,
      uint256 galtSpaceReward
    )
  {
    require(applications[_id].status != ApplicationStatus.NOT_EXISTS, "Application doesn't exist");

    Application storage m = applications[_id];

    return (
      m.status,
      m.currency,
      m.applicant,
      m.packageTokenId,
      m.assignedRoles,
      m.gasDeposit,
      m.validatorsReward,
      m.galtSpaceReward
    );
  }

  function getApplicationPayloadById(
    bytes32 _id
  )
    external
    view
    returns(
      bytes32 credentialsHash,
      uint8 precision,
      bytes2 country,
      bytes32 ledgerIdentifier
    )
  {
    require(applications[_id].status != ApplicationStatus.NOT_EXISTS, "Application doesn't exist");

    Application storage m = applications[_id];

    return (m.credentialsHash, m.precision, m.country, m.ledgerIdentifier);
  }

  function changeValidationStatus(
    Application storage _a,
    bytes32 _role,
    ValidationStatus _status
  )
    internal
  {
    emit LogValidationStatusChanged(_a.id, _role, _status);

    _a.validationStatus[_role] = _status;
  }

  function changeApplicationStatus(
    Application storage _a,
    ApplicationStatus _status
  )
    internal
  {
    emit LogApplicationStatusChanged(_a.id, _status);

    _a.status = _status;
  }
}