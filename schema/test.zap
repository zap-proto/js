# ZAP Test Schema for JavaScript/TypeScript
# Tests all primitive types and complex structures

struct TestAllTypes
  # Primitives
  boolField Bool
  int8Field Int8
  int16Field Int16
  int32Field Int32
  int64Field Int64
  uint8Field UInt8
  uint16Field UInt16
  uint32Field UInt32
  uint64Field UInt64
  float32Field Float32
  float64Field Float64
  textField Text
  dataField Data

  # Collections
  boolList List(Bool)
  int32List List(Int32)
  textList List(Text)
  structList List(NestedStruct)

  # Nested struct
  nested NestedStruct

struct NestedStruct
  value Text
  number Int32

enum TestEnum
  unknown
  first
  second
  third

struct TestUnion
  union
    nothing Void
    number Int32
    text Text
    nested NestedStruct

struct TestDefaults
  boolVal Bool = true
  int32Val Int32 = 42
  textVal Text = "default"

interface TestService
  echo (message Text) -> (response Text)
  add (a Int32, b Int32) -> (result Int32)
  getAll () -> (items List(TestAllTypes))
  streamData (query Text) -> stream (item TestAllTypes)
