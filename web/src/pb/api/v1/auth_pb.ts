// @generated by protoc-gen-es v1.10.0 with parameter "target=ts"
// @generated from file api/v1/auth.proto (package api.v1, syntax proto3)
/* eslint-disable */
// @ts-nocheck

import type { BinaryReadOptions, FieldList, JsonReadOptions, JsonValue, PartialMessage, PlainMessage } from "@bufbuild/protobuf";
import { Message, proto3 } from "@bufbuild/protobuf";

/**
 * @generated from message api.v1.SignupRequest
 */
export class SignupRequest extends Message<SignupRequest> {
  /**
   * @generated from field: string email = 1;
   */
  email = "";

  /**
   * @generated from field: string password = 2;
   */
  password = "";

  /**
   * @generated from field: string password_confirmation = 3;
   */
  passwordConfirmation = "";

  /**
   * @generated from field: string first_name = 4;
   */
  firstName = "";

  /**
   * @generated from field: string last_name = 5;
   */
  lastName = "";

  constructor(data?: PartialMessage<SignupRequest>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "api.v1.SignupRequest";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "email", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 2, name: "password", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 3, name: "password_confirmation", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 4, name: "first_name", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 5, name: "last_name", kind: "scalar", T: 9 /* ScalarType.STRING */ },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SignupRequest {
    return new SignupRequest().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SignupRequest {
    return new SignupRequest().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SignupRequest {
    return new SignupRequest().fromJsonString(jsonString, options);
  }

  static equals(a: SignupRequest | PlainMessage<SignupRequest> | undefined, b: SignupRequest | PlainMessage<SignupRequest> | undefined): boolean {
    return proto3.util.equals(SignupRequest, a, b);
  }
}

/**
 * @generated from message api.v1.SignupResponse
 */
export class SignupResponse extends Message<SignupResponse> {
  constructor(data?: PartialMessage<SignupResponse>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "api.v1.SignupResponse";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SignupResponse {
    return new SignupResponse().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SignupResponse {
    return new SignupResponse().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SignupResponse {
    return new SignupResponse().fromJsonString(jsonString, options);
  }

  static equals(a: SignupResponse | PlainMessage<SignupResponse> | undefined, b: SignupResponse | PlainMessage<SignupResponse> | undefined): boolean {
    return proto3.util.equals(SignupResponse, a, b);
  }
}

/**
 * @generated from message api.v1.LoginRequest
 */
export class LoginRequest extends Message<LoginRequest> {
  /**
   * @generated from field: string email = 1;
   */
  email = "";

  /**
   * @generated from field: string password = 2;
   */
  password = "";

  constructor(data?: PartialMessage<LoginRequest>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "api.v1.LoginRequest";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "email", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 2, name: "password", kind: "scalar", T: 9 /* ScalarType.STRING */ },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): LoginRequest {
    return new LoginRequest().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): LoginRequest {
    return new LoginRequest().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): LoginRequest {
    return new LoginRequest().fromJsonString(jsonString, options);
  }

  static equals(a: LoginRequest | PlainMessage<LoginRequest> | undefined, b: LoginRequest | PlainMessage<LoginRequest> | undefined): boolean {
    return proto3.util.equals(LoginRequest, a, b);
  }
}

/**
 * @generated from message api.v1.LoginResponse
 */
export class LoginResponse extends Message<LoginResponse> {
  /**
   * @generated from field: string access_token = 1;
   */
  accessToken = "";

  constructor(data?: PartialMessage<LoginResponse>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "api.v1.LoginResponse";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "access_token", kind: "scalar", T: 9 /* ScalarType.STRING */ },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): LoginResponse {
    return new LoginResponse().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): LoginResponse {
    return new LoginResponse().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): LoginResponse {
    return new LoginResponse().fromJsonString(jsonString, options);
  }

  static equals(a: LoginResponse | PlainMessage<LoginResponse> | undefined, b: LoginResponse | PlainMessage<LoginResponse> | undefined): boolean {
    return proto3.util.equals(LoginResponse, a, b);
  }
}

/**
 * @generated from message api.v1.RefreshTokenRequest
 */
export class RefreshTokenRequest extends Message<RefreshTokenRequest> {
  constructor(data?: PartialMessage<RefreshTokenRequest>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "api.v1.RefreshTokenRequest";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): RefreshTokenRequest {
    return new RefreshTokenRequest().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): RefreshTokenRequest {
    return new RefreshTokenRequest().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): RefreshTokenRequest {
    return new RefreshTokenRequest().fromJsonString(jsonString, options);
  }

  static equals(a: RefreshTokenRequest | PlainMessage<RefreshTokenRequest> | undefined, b: RefreshTokenRequest | PlainMessage<RefreshTokenRequest> | undefined): boolean {
    return proto3.util.equals(RefreshTokenRequest, a, b);
  }
}

/**
 * @generated from message api.v1.RefreshTokenResponse
 */
export class RefreshTokenResponse extends Message<RefreshTokenResponse> {
  /**
   * @generated from field: string access_token = 1;
   */
  accessToken = "";

  constructor(data?: PartialMessage<RefreshTokenResponse>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "api.v1.RefreshTokenResponse";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "access_token", kind: "scalar", T: 9 /* ScalarType.STRING */ },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): RefreshTokenResponse {
    return new RefreshTokenResponse().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): RefreshTokenResponse {
    return new RefreshTokenResponse().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): RefreshTokenResponse {
    return new RefreshTokenResponse().fromJsonString(jsonString, options);
  }

  static equals(a: RefreshTokenResponse | PlainMessage<RefreshTokenResponse> | undefined, b: RefreshTokenResponse | PlainMessage<RefreshTokenResponse> | undefined): boolean {
    return proto3.util.equals(RefreshTokenResponse, a, b);
  }
}

/**
 * @generated from message api.v1.LogoutRequest
 */
export class LogoutRequest extends Message<LogoutRequest> {
  constructor(data?: PartialMessage<LogoutRequest>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "api.v1.LogoutRequest";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): LogoutRequest {
    return new LogoutRequest().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): LogoutRequest {
    return new LogoutRequest().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): LogoutRequest {
    return new LogoutRequest().fromJsonString(jsonString, options);
  }

  static equals(a: LogoutRequest | PlainMessage<LogoutRequest> | undefined, b: LogoutRequest | PlainMessage<LogoutRequest> | undefined): boolean {
    return proto3.util.equals(LogoutRequest, a, b);
  }
}

/**
 * @generated from message api.v1.LogoutResponse
 */
export class LogoutResponse extends Message<LogoutResponse> {
  constructor(data?: PartialMessage<LogoutResponse>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "api.v1.LogoutResponse";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): LogoutResponse {
    return new LogoutResponse().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): LogoutResponse {
    return new LogoutResponse().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): LogoutResponse {
    return new LogoutResponse().fromJsonString(jsonString, options);
  }

  static equals(a: LogoutResponse | PlainMessage<LogoutResponse> | undefined, b: LogoutResponse | PlainMessage<LogoutResponse> | undefined): boolean {
    return proto3.util.equals(LogoutResponse, a, b);
  }
}
