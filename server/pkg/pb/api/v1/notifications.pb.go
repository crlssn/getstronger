// Code generated by protoc-gen-go. DO NOT EDIT.
// versions:
// 	protoc-gen-go v1.35.2
// 	protoc        (unknown)
// source: api/v1/notifications.proto

package apiv1

import (
	reflect "reflect"
	sync "sync"

	_ "buf.build/gen/go/bufbuild/protovalidate/protocolbuffers/go/buf/validate"
	protoreflect "google.golang.org/protobuf/reflect/protoreflect"
	protoimpl "google.golang.org/protobuf/runtime/protoimpl"
	_ "google.golang.org/protobuf/types/known/emptypb"
)

const (
	// Verify that this generated code is sufficiently up-to-date.
	_ = protoimpl.EnforceVersion(20 - protoimpl.MinVersion)
	// Verify that runtime/protoimpl is sufficiently up-to-date.
	_ = protoimpl.EnforceVersion(protoimpl.MaxVersion - 20)
)

type ListNotificationsRequest struct {
	state         protoimpl.MessageState
	sizeCache     protoimpl.SizeCache
	unknownFields protoimpl.UnknownFields

	UnreadOnly bool               `protobuf:"varint,1,opt,name=unread_only,json=unreadOnly,proto3" json:"unread_only,omitempty"`
	MarkAsRead bool               `protobuf:"varint,2,opt,name=mark_as_read,json=markAsRead,proto3" json:"mark_as_read,omitempty"`
	Pagination *PaginationRequest `protobuf:"bytes,3,opt,name=pagination,proto3" json:"pagination,omitempty"`
}

func (x *ListNotificationsRequest) Reset() {
	*x = ListNotificationsRequest{}
	mi := &file_api_v1_notifications_proto_msgTypes[0]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *ListNotificationsRequest) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*ListNotificationsRequest) ProtoMessage() {}

func (x *ListNotificationsRequest) ProtoReflect() protoreflect.Message {
	mi := &file_api_v1_notifications_proto_msgTypes[0]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use ListNotificationsRequest.ProtoReflect.Descriptor instead.
func (*ListNotificationsRequest) Descriptor() ([]byte, []int) {
	return file_api_v1_notifications_proto_rawDescGZIP(), []int{0}
}

func (x *ListNotificationsRequest) GetUnreadOnly() bool {
	if x != nil {
		return x.UnreadOnly
	}
	return false
}

func (x *ListNotificationsRequest) GetMarkAsRead() bool {
	if x != nil {
		return x.MarkAsRead
	}
	return false
}

func (x *ListNotificationsRequest) GetPagination() *PaginationRequest {
	if x != nil {
		return x.Pagination
	}
	return nil
}

type ListNotificationsResponse struct {
	state         protoimpl.MessageState
	sizeCache     protoimpl.SizeCache
	unknownFields protoimpl.UnknownFields

	Notifications []*Notification     `protobuf:"bytes,1,rep,name=notifications,proto3" json:"notifications,omitempty"`
	Pagination    *PaginationResponse `protobuf:"bytes,2,opt,name=pagination,proto3" json:"pagination,omitempty"`
}

func (x *ListNotificationsResponse) Reset() {
	*x = ListNotificationsResponse{}
	mi := &file_api_v1_notifications_proto_msgTypes[1]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *ListNotificationsResponse) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*ListNotificationsResponse) ProtoMessage() {}

func (x *ListNotificationsResponse) ProtoReflect() protoreflect.Message {
	mi := &file_api_v1_notifications_proto_msgTypes[1]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use ListNotificationsResponse.ProtoReflect.Descriptor instead.
func (*ListNotificationsResponse) Descriptor() ([]byte, []int) {
	return file_api_v1_notifications_proto_rawDescGZIP(), []int{1}
}

func (x *ListNotificationsResponse) GetNotifications() []*Notification {
	if x != nil {
		return x.Notifications
	}
	return nil
}

func (x *ListNotificationsResponse) GetPagination() *PaginationResponse {
	if x != nil {
		return x.Pagination
	}
	return nil
}

type Notification struct {
	state         protoimpl.MessageState
	sizeCache     protoimpl.SizeCache
	unknownFields protoimpl.UnknownFields

	Id string `protobuf:"bytes,1,opt,name=id,proto3" json:"id,omitempty"`
	// DEBT: This should be a timestamp but the client is not able to parse it.
	NotifiedAtUnix int64 `protobuf:"varint,2,opt,name=notified_at_unix,json=notifiedAtUnix,proto3" json:"notified_at_unix,omitempty"`
	// Types that are assignable to Type:
	//
	//	*Notification_UserFollowed_
	//	*Notification_WorkoutComment_
	Type isNotification_Type `protobuf_oneof:"type"`
}

func (x *Notification) Reset() {
	*x = Notification{}
	mi := &file_api_v1_notifications_proto_msgTypes[2]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *Notification) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*Notification) ProtoMessage() {}

func (x *Notification) ProtoReflect() protoreflect.Message {
	mi := &file_api_v1_notifications_proto_msgTypes[2]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use Notification.ProtoReflect.Descriptor instead.
func (*Notification) Descriptor() ([]byte, []int) {
	return file_api_v1_notifications_proto_rawDescGZIP(), []int{2}
}

func (x *Notification) GetId() string {
	if x != nil {
		return x.Id
	}
	return ""
}

func (x *Notification) GetNotifiedAtUnix() int64 {
	if x != nil {
		return x.NotifiedAtUnix
	}
	return 0
}

func (m *Notification) GetType() isNotification_Type {
	if m != nil {
		return m.Type
	}
	return nil
}

func (x *Notification) GetUserFollowed() *Notification_UserFollowed {
	if x, ok := x.GetType().(*Notification_UserFollowed_); ok {
		return x.UserFollowed
	}
	return nil
}

func (x *Notification) GetWorkoutComment() *Notification_WorkoutComment {
	if x, ok := x.GetType().(*Notification_WorkoutComment_); ok {
		return x.WorkoutComment
	}
	return nil
}

type isNotification_Type interface {
	isNotification_Type()
}

type Notification_UserFollowed_ struct {
	UserFollowed *Notification_UserFollowed `protobuf:"bytes,3,opt,name=user_followed,json=userFollowed,proto3,oneof"`
}

type Notification_WorkoutComment_ struct {
	WorkoutComment *Notification_WorkoutComment `protobuf:"bytes,4,opt,name=workout_comment,json=workoutComment,proto3,oneof"`
}

func (*Notification_UserFollowed_) isNotification_Type() {}

func (*Notification_WorkoutComment_) isNotification_Type() {}

type UnreadNotificationsRequest struct {
	state         protoimpl.MessageState
	sizeCache     protoimpl.SizeCache
	unknownFields protoimpl.UnknownFields
}

func (x *UnreadNotificationsRequest) Reset() {
	*x = UnreadNotificationsRequest{}
	mi := &file_api_v1_notifications_proto_msgTypes[3]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *UnreadNotificationsRequest) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*UnreadNotificationsRequest) ProtoMessage() {}

func (x *UnreadNotificationsRequest) ProtoReflect() protoreflect.Message {
	mi := &file_api_v1_notifications_proto_msgTypes[3]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use UnreadNotificationsRequest.ProtoReflect.Descriptor instead.
func (*UnreadNotificationsRequest) Descriptor() ([]byte, []int) {
	return file_api_v1_notifications_proto_rawDescGZIP(), []int{3}
}

type UnreadNotificationsResponse struct {
	state         protoimpl.MessageState
	sizeCache     protoimpl.SizeCache
	unknownFields protoimpl.UnknownFields

	Count int64 `protobuf:"varint,1,opt,name=count,proto3" json:"count,omitempty"`
}

func (x *UnreadNotificationsResponse) Reset() {
	*x = UnreadNotificationsResponse{}
	mi := &file_api_v1_notifications_proto_msgTypes[4]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *UnreadNotificationsResponse) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*UnreadNotificationsResponse) ProtoMessage() {}

func (x *UnreadNotificationsResponse) ProtoReflect() protoreflect.Message {
	mi := &file_api_v1_notifications_proto_msgTypes[4]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use UnreadNotificationsResponse.ProtoReflect.Descriptor instead.
func (*UnreadNotificationsResponse) Descriptor() ([]byte, []int) {
	return file_api_v1_notifications_proto_rawDescGZIP(), []int{4}
}

func (x *UnreadNotificationsResponse) GetCount() int64 {
	if x != nil {
		return x.Count
	}
	return 0
}

type Notification_UserFollowed struct {
	state         protoimpl.MessageState
	sizeCache     protoimpl.SizeCache
	unknownFields protoimpl.UnknownFields

	Actor *User `protobuf:"bytes,1,opt,name=actor,proto3" json:"actor,omitempty"`
}

func (x *Notification_UserFollowed) Reset() {
	*x = Notification_UserFollowed{}
	mi := &file_api_v1_notifications_proto_msgTypes[5]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *Notification_UserFollowed) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*Notification_UserFollowed) ProtoMessage() {}

func (x *Notification_UserFollowed) ProtoReflect() protoreflect.Message {
	mi := &file_api_v1_notifications_proto_msgTypes[5]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use Notification_UserFollowed.ProtoReflect.Descriptor instead.
func (*Notification_UserFollowed) Descriptor() ([]byte, []int) {
	return file_api_v1_notifications_proto_rawDescGZIP(), []int{2, 0}
}

func (x *Notification_UserFollowed) GetActor() *User {
	if x != nil {
		return x.Actor
	}
	return nil
}

type Notification_WorkoutComment struct {
	state         protoimpl.MessageState
	sizeCache     protoimpl.SizeCache
	unknownFields protoimpl.UnknownFields

	Actor   *User    `protobuf:"bytes,1,opt,name=actor,proto3" json:"actor,omitempty"`
	Workout *Workout `protobuf:"bytes,2,opt,name=workout,proto3" json:"workout,omitempty"`
}

func (x *Notification_WorkoutComment) Reset() {
	*x = Notification_WorkoutComment{}
	mi := &file_api_v1_notifications_proto_msgTypes[6]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *Notification_WorkoutComment) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*Notification_WorkoutComment) ProtoMessage() {}

func (x *Notification_WorkoutComment) ProtoReflect() protoreflect.Message {
	mi := &file_api_v1_notifications_proto_msgTypes[6]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use Notification_WorkoutComment.ProtoReflect.Descriptor instead.
func (*Notification_WorkoutComment) Descriptor() ([]byte, []int) {
	return file_api_v1_notifications_proto_rawDescGZIP(), []int{2, 1}
}

func (x *Notification_WorkoutComment) GetActor() *User {
	if x != nil {
		return x.Actor
	}
	return nil
}

func (x *Notification_WorkoutComment) GetWorkout() *Workout {
	if x != nil {
		return x.Workout
	}
	return nil
}

var File_api_v1_notifications_proto protoreflect.FileDescriptor

var file_api_v1_notifications_proto_rawDesc = []byte{
	0x0a, 0x1a, 0x61, 0x70, 0x69, 0x2f, 0x76, 0x31, 0x2f, 0x6e, 0x6f, 0x74, 0x69, 0x66, 0x69, 0x63,
	0x61, 0x74, 0x69, 0x6f, 0x6e, 0x73, 0x2e, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x12, 0x06, 0x61, 0x70,
	0x69, 0x2e, 0x76, 0x31, 0x1a, 0x14, 0x61, 0x70, 0x69, 0x2f, 0x76, 0x31, 0x2f, 0x6f, 0x70, 0x74,
	0x69, 0x6f, 0x6e, 0x73, 0x2e, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x1a, 0x13, 0x61, 0x70, 0x69, 0x2f,
	0x76, 0x31, 0x2f, 0x73, 0x68, 0x61, 0x72, 0x65, 0x64, 0x2e, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x1a,
	0x15, 0x61, 0x70, 0x69, 0x2f, 0x76, 0x31, 0x2f, 0x77, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x73,
	0x2e, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x1a, 0x1b, 0x67, 0x6f, 0x6f, 0x67, 0x6c, 0x65, 0x2f, 0x70,
	0x72, 0x6f, 0x74, 0x6f, 0x62, 0x75, 0x66, 0x2f, 0x65, 0x6d, 0x70, 0x74, 0x79, 0x2e, 0x70, 0x72,
	0x6f, 0x74, 0x6f, 0x1a, 0x1b, 0x62, 0x75, 0x66, 0x2f, 0x76, 0x61, 0x6c, 0x69, 0x64, 0x61, 0x74,
	0x65, 0x2f, 0x76, 0x61, 0x6c, 0x69, 0x64, 0x61, 0x74, 0x65, 0x2e, 0x70, 0x72, 0x6f, 0x74, 0x6f,
	0x22, 0xa0, 0x01, 0x0a, 0x18, 0x4c, 0x69, 0x73, 0x74, 0x4e, 0x6f, 0x74, 0x69, 0x66, 0x69, 0x63,
	0x61, 0x74, 0x69, 0x6f, 0x6e, 0x73, 0x52, 0x65, 0x71, 0x75, 0x65, 0x73, 0x74, 0x12, 0x1f, 0x0a,
	0x0b, 0x75, 0x6e, 0x72, 0x65, 0x61, 0x64, 0x5f, 0x6f, 0x6e, 0x6c, 0x79, 0x18, 0x01, 0x20, 0x01,
	0x28, 0x08, 0x52, 0x0a, 0x75, 0x6e, 0x72, 0x65, 0x61, 0x64, 0x4f, 0x6e, 0x6c, 0x79, 0x12, 0x20,
	0x0a, 0x0c, 0x6d, 0x61, 0x72, 0x6b, 0x5f, 0x61, 0x73, 0x5f, 0x72, 0x65, 0x61, 0x64, 0x18, 0x02,
	0x20, 0x01, 0x28, 0x08, 0x52, 0x0a, 0x6d, 0x61, 0x72, 0x6b, 0x41, 0x73, 0x52, 0x65, 0x61, 0x64,
	0x12, 0x41, 0x0a, 0x0a, 0x70, 0x61, 0x67, 0x69, 0x6e, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x18, 0x03,
	0x20, 0x01, 0x28, 0x0b, 0x32, 0x19, 0x2e, 0x61, 0x70, 0x69, 0x2e, 0x76, 0x31, 0x2e, 0x50, 0x61,
	0x67, 0x69, 0x6e, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x52, 0x65, 0x71, 0x75, 0x65, 0x73, 0x74, 0x42,
	0x06, 0xba, 0x48, 0x03, 0xc8, 0x01, 0x01, 0x52, 0x0a, 0x70, 0x61, 0x67, 0x69, 0x6e, 0x61, 0x74,
	0x69, 0x6f, 0x6e, 0x22, 0x93, 0x01, 0x0a, 0x19, 0x4c, 0x69, 0x73, 0x74, 0x4e, 0x6f, 0x74, 0x69,
	0x66, 0x69, 0x63, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x73, 0x52, 0x65, 0x73, 0x70, 0x6f, 0x6e, 0x73,
	0x65, 0x12, 0x3a, 0x0a, 0x0d, 0x6e, 0x6f, 0x74, 0x69, 0x66, 0x69, 0x63, 0x61, 0x74, 0x69, 0x6f,
	0x6e, 0x73, 0x18, 0x01, 0x20, 0x03, 0x28, 0x0b, 0x32, 0x14, 0x2e, 0x61, 0x70, 0x69, 0x2e, 0x76,
	0x31, 0x2e, 0x4e, 0x6f, 0x74, 0x69, 0x66, 0x69, 0x63, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x52, 0x0d,
	0x6e, 0x6f, 0x74, 0x69, 0x66, 0x69, 0x63, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x73, 0x12, 0x3a, 0x0a,
	0x0a, 0x70, 0x61, 0x67, 0x69, 0x6e, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x18, 0x02, 0x20, 0x01, 0x28,
	0x0b, 0x32, 0x1a, 0x2e, 0x61, 0x70, 0x69, 0x2e, 0x76, 0x31, 0x2e, 0x50, 0x61, 0x67, 0x69, 0x6e,
	0x61, 0x74, 0x69, 0x6f, 0x6e, 0x52, 0x65, 0x73, 0x70, 0x6f, 0x6e, 0x73, 0x65, 0x52, 0x0a, 0x70,
	0x61, 0x67, 0x69, 0x6e, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x22, 0xff, 0x02, 0x0a, 0x0c, 0x4e, 0x6f,
	0x74, 0x69, 0x66, 0x69, 0x63, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x12, 0x0e, 0x0a, 0x02, 0x69, 0x64,
	0x18, 0x01, 0x20, 0x01, 0x28, 0x09, 0x52, 0x02, 0x69, 0x64, 0x12, 0x28, 0x0a, 0x10, 0x6e, 0x6f,
	0x74, 0x69, 0x66, 0x69, 0x65, 0x64, 0x5f, 0x61, 0x74, 0x5f, 0x75, 0x6e, 0x69, 0x78, 0x18, 0x02,
	0x20, 0x01, 0x28, 0x03, 0x52, 0x0e, 0x6e, 0x6f, 0x74, 0x69, 0x66, 0x69, 0x65, 0x64, 0x41, 0x74,
	0x55, 0x6e, 0x69, 0x78, 0x12, 0x48, 0x0a, 0x0d, 0x75, 0x73, 0x65, 0x72, 0x5f, 0x66, 0x6f, 0x6c,
	0x6c, 0x6f, 0x77, 0x65, 0x64, 0x18, 0x03, 0x20, 0x01, 0x28, 0x0b, 0x32, 0x21, 0x2e, 0x61, 0x70,
	0x69, 0x2e, 0x76, 0x31, 0x2e, 0x4e, 0x6f, 0x74, 0x69, 0x66, 0x69, 0x63, 0x61, 0x74, 0x69, 0x6f,
	0x6e, 0x2e, 0x55, 0x73, 0x65, 0x72, 0x46, 0x6f, 0x6c, 0x6c, 0x6f, 0x77, 0x65, 0x64, 0x48, 0x00,
	0x52, 0x0c, 0x75, 0x73, 0x65, 0x72, 0x46, 0x6f, 0x6c, 0x6c, 0x6f, 0x77, 0x65, 0x64, 0x12, 0x4e,
	0x0a, 0x0f, 0x77, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x5f, 0x63, 0x6f, 0x6d, 0x6d, 0x65, 0x6e,
	0x74, 0x18, 0x04, 0x20, 0x01, 0x28, 0x0b, 0x32, 0x23, 0x2e, 0x61, 0x70, 0x69, 0x2e, 0x76, 0x31,
	0x2e, 0x4e, 0x6f, 0x74, 0x69, 0x66, 0x69, 0x63, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x2e, 0x57, 0x6f,
	0x72, 0x6b, 0x6f, 0x75, 0x74, 0x43, 0x6f, 0x6d, 0x6d, 0x65, 0x6e, 0x74, 0x48, 0x00, 0x52, 0x0e,
	0x77, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x43, 0x6f, 0x6d, 0x6d, 0x65, 0x6e, 0x74, 0x1a, 0x32,
	0x0a, 0x0c, 0x55, 0x73, 0x65, 0x72, 0x46, 0x6f, 0x6c, 0x6c, 0x6f, 0x77, 0x65, 0x64, 0x12, 0x22,
	0x0a, 0x05, 0x61, 0x63, 0x74, 0x6f, 0x72, 0x18, 0x01, 0x20, 0x01, 0x28, 0x0b, 0x32, 0x0c, 0x2e,
	0x61, 0x70, 0x69, 0x2e, 0x76, 0x31, 0x2e, 0x55, 0x73, 0x65, 0x72, 0x52, 0x05, 0x61, 0x63, 0x74,
	0x6f, 0x72, 0x1a, 0x5f, 0x0a, 0x0e, 0x57, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x43, 0x6f, 0x6d,
	0x6d, 0x65, 0x6e, 0x74, 0x12, 0x22, 0x0a, 0x05, 0x61, 0x63, 0x74, 0x6f, 0x72, 0x18, 0x01, 0x20,
	0x01, 0x28, 0x0b, 0x32, 0x0c, 0x2e, 0x61, 0x70, 0x69, 0x2e, 0x76, 0x31, 0x2e, 0x55, 0x73, 0x65,
	0x72, 0x52, 0x05, 0x61, 0x63, 0x74, 0x6f, 0x72, 0x12, 0x29, 0x0a, 0x07, 0x77, 0x6f, 0x72, 0x6b,
	0x6f, 0x75, 0x74, 0x18, 0x02, 0x20, 0x01, 0x28, 0x0b, 0x32, 0x0f, 0x2e, 0x61, 0x70, 0x69, 0x2e,
	0x76, 0x31, 0x2e, 0x57, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x52, 0x07, 0x77, 0x6f, 0x72, 0x6b,
	0x6f, 0x75, 0x74, 0x42, 0x06, 0x0a, 0x04, 0x74, 0x79, 0x70, 0x65, 0x22, 0x1c, 0x0a, 0x1a, 0x55,
	0x6e, 0x72, 0x65, 0x61, 0x64, 0x4e, 0x6f, 0x74, 0x69, 0x66, 0x69, 0x63, 0x61, 0x74, 0x69, 0x6f,
	0x6e, 0x73, 0x52, 0x65, 0x71, 0x75, 0x65, 0x73, 0x74, 0x22, 0x33, 0x0a, 0x1b, 0x55, 0x6e, 0x72,
	0x65, 0x61, 0x64, 0x4e, 0x6f, 0x74, 0x69, 0x66, 0x69, 0x63, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x73,
	0x52, 0x65, 0x73, 0x70, 0x6f, 0x6e, 0x73, 0x65, 0x12, 0x14, 0x0a, 0x05, 0x63, 0x6f, 0x75, 0x6e,
	0x74, 0x18, 0x01, 0x20, 0x01, 0x28, 0x03, 0x52, 0x05, 0x63, 0x6f, 0x75, 0x6e, 0x74, 0x32, 0xdd,
	0x01, 0x0a, 0x13, 0x4e, 0x6f, 0x74, 0x69, 0x66, 0x69, 0x63, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x53,
	0x65, 0x72, 0x76, 0x69, 0x63, 0x65, 0x12, 0x5e, 0x0a, 0x11, 0x4c, 0x69, 0x73, 0x74, 0x4e, 0x6f,
	0x74, 0x69, 0x66, 0x69, 0x63, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x73, 0x12, 0x20, 0x2e, 0x61, 0x70,
	0x69, 0x2e, 0x76, 0x31, 0x2e, 0x4c, 0x69, 0x73, 0x74, 0x4e, 0x6f, 0x74, 0x69, 0x66, 0x69, 0x63,
	0x61, 0x74, 0x69, 0x6f, 0x6e, 0x73, 0x52, 0x65, 0x71, 0x75, 0x65, 0x73, 0x74, 0x1a, 0x21, 0x2e,
	0x61, 0x70, 0x69, 0x2e, 0x76, 0x31, 0x2e, 0x4c, 0x69, 0x73, 0x74, 0x4e, 0x6f, 0x74, 0x69, 0x66,
	0x69, 0x63, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x73, 0x52, 0x65, 0x73, 0x70, 0x6f, 0x6e, 0x73, 0x65,
	0x22, 0x04, 0x88, 0xb5, 0x18, 0x01, 0x12, 0x66, 0x0a, 0x13, 0x55, 0x6e, 0x72, 0x65, 0x61, 0x64,
	0x4e, 0x6f, 0x74, 0x69, 0x66, 0x69, 0x63, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x73, 0x12, 0x22, 0x2e,
	0x61, 0x70, 0x69, 0x2e, 0x76, 0x31, 0x2e, 0x55, 0x6e, 0x72, 0x65, 0x61, 0x64, 0x4e, 0x6f, 0x74,
	0x69, 0x66, 0x69, 0x63, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x73, 0x52, 0x65, 0x71, 0x75, 0x65, 0x73,
	0x74, 0x1a, 0x23, 0x2e, 0x61, 0x70, 0x69, 0x2e, 0x76, 0x31, 0x2e, 0x55, 0x6e, 0x72, 0x65, 0x61,
	0x64, 0x4e, 0x6f, 0x74, 0x69, 0x66, 0x69, 0x63, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x73, 0x52, 0x65,
	0x73, 0x70, 0x6f, 0x6e, 0x73, 0x65, 0x22, 0x04, 0x88, 0xb5, 0x18, 0x01, 0x30, 0x01, 0x42, 0x93,
	0x01, 0x0a, 0x0a, 0x63, 0x6f, 0x6d, 0x2e, 0x61, 0x70, 0x69, 0x2e, 0x76, 0x31, 0x42, 0x12, 0x4e,
	0x6f, 0x74, 0x69, 0x66, 0x69, 0x63, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x73, 0x50, 0x72, 0x6f, 0x74,
	0x6f, 0x50, 0x01, 0x5a, 0x38, 0x67, 0x69, 0x74, 0x68, 0x75, 0x62, 0x2e, 0x63, 0x6f, 0x6d, 0x2f,
	0x63, 0x72, 0x6c, 0x73, 0x73, 0x6e, 0x2f, 0x67, 0x65, 0x74, 0x73, 0x74, 0x72, 0x6f, 0x6e, 0x67,
	0x65, 0x72, 0x2f, 0x73, 0x65, 0x72, 0x76, 0x65, 0x72, 0x2f, 0x70, 0x6b, 0x67, 0x2f, 0x70, 0x62,
	0x2f, 0x61, 0x70, 0x69, 0x2f, 0x76, 0x31, 0x3b, 0x61, 0x70, 0x69, 0x76, 0x31, 0xa2, 0x02, 0x03,
	0x41, 0x58, 0x58, 0xaa, 0x02, 0x06, 0x41, 0x70, 0x69, 0x2e, 0x56, 0x31, 0xca, 0x02, 0x06, 0x41,
	0x70, 0x69, 0x5c, 0x56, 0x31, 0xe2, 0x02, 0x12, 0x41, 0x70, 0x69, 0x5c, 0x56, 0x31, 0x5c, 0x47,
	0x50, 0x42, 0x4d, 0x65, 0x74, 0x61, 0x64, 0x61, 0x74, 0x61, 0xea, 0x02, 0x07, 0x41, 0x70, 0x69,
	0x3a, 0x3a, 0x56, 0x31, 0x62, 0x06, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x33,
}

var (
	file_api_v1_notifications_proto_rawDescOnce sync.Once
	file_api_v1_notifications_proto_rawDescData = file_api_v1_notifications_proto_rawDesc
)

func file_api_v1_notifications_proto_rawDescGZIP() []byte {
	file_api_v1_notifications_proto_rawDescOnce.Do(func() {
		file_api_v1_notifications_proto_rawDescData = protoimpl.X.CompressGZIP(file_api_v1_notifications_proto_rawDescData)
	})
	return file_api_v1_notifications_proto_rawDescData
}

var file_api_v1_notifications_proto_msgTypes = make([]protoimpl.MessageInfo, 7)
var file_api_v1_notifications_proto_goTypes = []any{
	(*ListNotificationsRequest)(nil),    // 0: api.v1.ListNotificationsRequest
	(*ListNotificationsResponse)(nil),   // 1: api.v1.ListNotificationsResponse
	(*Notification)(nil),                // 2: api.v1.Notification
	(*UnreadNotificationsRequest)(nil),  // 3: api.v1.UnreadNotificationsRequest
	(*UnreadNotificationsResponse)(nil), // 4: api.v1.UnreadNotificationsResponse
	(*Notification_UserFollowed)(nil),   // 5: api.v1.Notification.UserFollowed
	(*Notification_WorkoutComment)(nil), // 6: api.v1.Notification.WorkoutComment
	(*PaginationRequest)(nil),           // 7: api.v1.PaginationRequest
	(*PaginationResponse)(nil),          // 8: api.v1.PaginationResponse
	(*User)(nil),                        // 9: api.v1.User
	(*Workout)(nil),                     // 10: api.v1.Workout
}
var file_api_v1_notifications_proto_depIdxs = []int32{
	7,  // 0: api.v1.ListNotificationsRequest.pagination:type_name -> api.v1.PaginationRequest
	2,  // 1: api.v1.ListNotificationsResponse.notifications:type_name -> api.v1.Notification
	8,  // 2: api.v1.ListNotificationsResponse.pagination:type_name -> api.v1.PaginationResponse
	5,  // 3: api.v1.Notification.user_followed:type_name -> api.v1.Notification.UserFollowed
	6,  // 4: api.v1.Notification.workout_comment:type_name -> api.v1.Notification.WorkoutComment
	9,  // 5: api.v1.Notification.UserFollowed.actor:type_name -> api.v1.User
	9,  // 6: api.v1.Notification.WorkoutComment.actor:type_name -> api.v1.User
	10, // 7: api.v1.Notification.WorkoutComment.workout:type_name -> api.v1.Workout
	0,  // 8: api.v1.NotificationService.ListNotifications:input_type -> api.v1.ListNotificationsRequest
	3,  // 9: api.v1.NotificationService.UnreadNotifications:input_type -> api.v1.UnreadNotificationsRequest
	1,  // 10: api.v1.NotificationService.ListNotifications:output_type -> api.v1.ListNotificationsResponse
	4,  // 11: api.v1.NotificationService.UnreadNotifications:output_type -> api.v1.UnreadNotificationsResponse
	10, // [10:12] is the sub-list for method output_type
	8,  // [8:10] is the sub-list for method input_type
	8,  // [8:8] is the sub-list for extension type_name
	8,  // [8:8] is the sub-list for extension extendee
	0,  // [0:8] is the sub-list for field type_name
}

func init() { file_api_v1_notifications_proto_init() }
func file_api_v1_notifications_proto_init() {
	if File_api_v1_notifications_proto != nil {
		return
	}
	file_api_v1_options_proto_init()
	file_api_v1_shared_proto_init()
	file_api_v1_workouts_proto_init()
	file_api_v1_notifications_proto_msgTypes[2].OneofWrappers = []any{
		(*Notification_UserFollowed_)(nil),
		(*Notification_WorkoutComment_)(nil),
	}
	type x struct{}
	out := protoimpl.TypeBuilder{
		File: protoimpl.DescBuilder{
			GoPackagePath: reflect.TypeOf(x{}).PkgPath(),
			RawDescriptor: file_api_v1_notifications_proto_rawDesc,
			NumEnums:      0,
			NumMessages:   7,
			NumExtensions: 0,
			NumServices:   1,
		},
		GoTypes:           file_api_v1_notifications_proto_goTypes,
		DependencyIndexes: file_api_v1_notifications_proto_depIdxs,
		MessageInfos:      file_api_v1_notifications_proto_msgTypes,
	}.Build()
	File_api_v1_notifications_proto = out.File
	file_api_v1_notifications_proto_rawDesc = nil
	file_api_v1_notifications_proto_goTypes = nil
	file_api_v1_notifications_proto_depIdxs = nil
}