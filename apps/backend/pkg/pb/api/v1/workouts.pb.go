// Code generated by protoc-gen-go. DO NOT EDIT.
// versions:
// 	protoc-gen-go v1.35.2
// 	protoc        (unknown)
// source: api/v1/workouts.proto

package apiv1

import (
	reflect "reflect"
	sync "sync"

	_ "buf.build/gen/go/bufbuild/protovalidate/protocolbuffers/go/buf/validate"
	protoreflect "google.golang.org/protobuf/reflect/protoreflect"
	protoimpl "google.golang.org/protobuf/runtime/protoimpl"
	fieldmaskpb "google.golang.org/protobuf/types/known/fieldmaskpb"
	_ "google.golang.org/protobuf/types/known/timestamppb"
)

const (
	// Verify that this generated code is sufficiently up-to-date.
	_ = protoimpl.EnforceVersion(20 - protoimpl.MinVersion)
	// Verify that runtime/protoimpl is sufficiently up-to-date.
	_ = protoimpl.EnforceVersion(protoimpl.MaxVersion - 20)
)

type FinishWorkoutRequest struct {
	state         protoimpl.MessageState
	sizeCache     protoimpl.SizeCache
	unknownFields protoimpl.UnknownFields

	Workout *Workout `protobuf:"bytes,1,opt,name=workout,proto3" json:"workout,omitempty"`
}

func (x *FinishWorkoutRequest) Reset() {
	*x = FinishWorkoutRequest{}
	mi := &file_api_v1_workouts_proto_msgTypes[0]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *FinishWorkoutRequest) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*FinishWorkoutRequest) ProtoMessage() {}

func (x *FinishWorkoutRequest) ProtoReflect() protoreflect.Message {
	mi := &file_api_v1_workouts_proto_msgTypes[0]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use FinishWorkoutRequest.ProtoReflect.Descriptor instead.
func (*FinishWorkoutRequest) Descriptor() ([]byte, []int) {
	return file_api_v1_workouts_proto_rawDescGZIP(), []int{0}
}

func (x *FinishWorkoutRequest) GetWorkout() *Workout {
	if x != nil {
		return x.Workout
	}
	return nil
}

type FinishWorkoutResponse struct {
	state         protoimpl.MessageState
	sizeCache     protoimpl.SizeCache
	unknownFields protoimpl.UnknownFields
}

func (x *FinishWorkoutResponse) Reset() {
	*x = FinishWorkoutResponse{}
	mi := &file_api_v1_workouts_proto_msgTypes[1]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *FinishWorkoutResponse) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*FinishWorkoutResponse) ProtoMessage() {}

func (x *FinishWorkoutResponse) ProtoReflect() protoreflect.Message {
	mi := &file_api_v1_workouts_proto_msgTypes[1]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use FinishWorkoutResponse.ProtoReflect.Descriptor instead.
func (*FinishWorkoutResponse) Descriptor() ([]byte, []int) {
	return file_api_v1_workouts_proto_rawDescGZIP(), []int{1}
}

type GetWorkoutRequest struct {
	state         protoimpl.MessageState
	sizeCache     protoimpl.SizeCache
	unknownFields protoimpl.UnknownFields

	Id string `protobuf:"bytes,1,opt,name=id,proto3" json:"id,omitempty"`
}

func (x *GetWorkoutRequest) Reset() {
	*x = GetWorkoutRequest{}
	mi := &file_api_v1_workouts_proto_msgTypes[2]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *GetWorkoutRequest) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*GetWorkoutRequest) ProtoMessage() {}

func (x *GetWorkoutRequest) ProtoReflect() protoreflect.Message {
	mi := &file_api_v1_workouts_proto_msgTypes[2]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use GetWorkoutRequest.ProtoReflect.Descriptor instead.
func (*GetWorkoutRequest) Descriptor() ([]byte, []int) {
	return file_api_v1_workouts_proto_rawDescGZIP(), []int{2}
}

func (x *GetWorkoutRequest) GetId() string {
	if x != nil {
		return x.Id
	}
	return ""
}

type GetWorkoutResponse struct {
	state         protoimpl.MessageState
	sizeCache     protoimpl.SizeCache
	unknownFields protoimpl.UnknownFields

	Workout *Workout `protobuf:"bytes,1,opt,name=Workout,proto3" json:"Workout,omitempty"`
}

func (x *GetWorkoutResponse) Reset() {
	*x = GetWorkoutResponse{}
	mi := &file_api_v1_workouts_proto_msgTypes[3]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *GetWorkoutResponse) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*GetWorkoutResponse) ProtoMessage() {}

func (x *GetWorkoutResponse) ProtoReflect() protoreflect.Message {
	mi := &file_api_v1_workouts_proto_msgTypes[3]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use GetWorkoutResponse.ProtoReflect.Descriptor instead.
func (*GetWorkoutResponse) Descriptor() ([]byte, []int) {
	return file_api_v1_workouts_proto_rawDescGZIP(), []int{3}
}

func (x *GetWorkoutResponse) GetWorkout() *Workout {
	if x != nil {
		return x.Workout
	}
	return nil
}

type UpdateWorkoutRequest struct {
	state         protoimpl.MessageState
	sizeCache     protoimpl.SizeCache
	unknownFields protoimpl.UnknownFields

	Workout    *Workout               `protobuf:"bytes,1,opt,name=Workout,proto3" json:"Workout,omitempty"`
	UpdateMask *fieldmaskpb.FieldMask `protobuf:"bytes,2,opt,name=update_mask,json=updateMask,proto3" json:"update_mask,omitempty"`
}

func (x *UpdateWorkoutRequest) Reset() {
	*x = UpdateWorkoutRequest{}
	mi := &file_api_v1_workouts_proto_msgTypes[4]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *UpdateWorkoutRequest) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*UpdateWorkoutRequest) ProtoMessage() {}

func (x *UpdateWorkoutRequest) ProtoReflect() protoreflect.Message {
	mi := &file_api_v1_workouts_proto_msgTypes[4]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use UpdateWorkoutRequest.ProtoReflect.Descriptor instead.
func (*UpdateWorkoutRequest) Descriptor() ([]byte, []int) {
	return file_api_v1_workouts_proto_rawDescGZIP(), []int{4}
}

func (x *UpdateWorkoutRequest) GetWorkout() *Workout {
	if x != nil {
		return x.Workout
	}
	return nil
}

func (x *UpdateWorkoutRequest) GetUpdateMask() *fieldmaskpb.FieldMask {
	if x != nil {
		return x.UpdateMask
	}
	return nil
}

type UpdateWorkoutResponse struct {
	state         protoimpl.MessageState
	sizeCache     protoimpl.SizeCache
	unknownFields protoimpl.UnknownFields

	Workout *Workout `protobuf:"bytes,1,opt,name=Workout,proto3" json:"Workout,omitempty"`
}

func (x *UpdateWorkoutResponse) Reset() {
	*x = UpdateWorkoutResponse{}
	mi := &file_api_v1_workouts_proto_msgTypes[5]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *UpdateWorkoutResponse) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*UpdateWorkoutResponse) ProtoMessage() {}

func (x *UpdateWorkoutResponse) ProtoReflect() protoreflect.Message {
	mi := &file_api_v1_workouts_proto_msgTypes[5]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use UpdateWorkoutResponse.ProtoReflect.Descriptor instead.
func (*UpdateWorkoutResponse) Descriptor() ([]byte, []int) {
	return file_api_v1_workouts_proto_rawDescGZIP(), []int{5}
}

func (x *UpdateWorkoutResponse) GetWorkout() *Workout {
	if x != nil {
		return x.Workout
	}
	return nil
}

type ListWorkoutsRequest struct {
	state         protoimpl.MessageState
	sizeCache     protoimpl.SizeCache
	unknownFields protoimpl.UnknownFields

	PageSize  int32  `protobuf:"varint,1,opt,name=page_size,json=pageSize,proto3" json:"page_size,omitempty"`
	PageToken []byte `protobuf:"bytes,2,opt,name=page_token,json=pageToken,proto3" json:"page_token,omitempty"`
}

func (x *ListWorkoutsRequest) Reset() {
	*x = ListWorkoutsRequest{}
	mi := &file_api_v1_workouts_proto_msgTypes[6]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *ListWorkoutsRequest) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*ListWorkoutsRequest) ProtoMessage() {}

func (x *ListWorkoutsRequest) ProtoReflect() protoreflect.Message {
	mi := &file_api_v1_workouts_proto_msgTypes[6]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use ListWorkoutsRequest.ProtoReflect.Descriptor instead.
func (*ListWorkoutsRequest) Descriptor() ([]byte, []int) {
	return file_api_v1_workouts_proto_rawDescGZIP(), []int{6}
}

func (x *ListWorkoutsRequest) GetPageSize() int32 {
	if x != nil {
		return x.PageSize
	}
	return 0
}

func (x *ListWorkoutsRequest) GetPageToken() []byte {
	if x != nil {
		return x.PageToken
	}
	return nil
}

type ListWorkoutsResponse struct {
	state         protoimpl.MessageState
	sizeCache     protoimpl.SizeCache
	unknownFields protoimpl.UnknownFields

	Workouts      []*Workout `protobuf:"bytes,1,rep,name=workouts,proto3" json:"workouts,omitempty"`
	NextPageToken []byte     `protobuf:"bytes,2,opt,name=next_page_token,json=nextPageToken,proto3" json:"next_page_token,omitempty"`
}

func (x *ListWorkoutsResponse) Reset() {
	*x = ListWorkoutsResponse{}
	mi := &file_api_v1_workouts_proto_msgTypes[7]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *ListWorkoutsResponse) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*ListWorkoutsResponse) ProtoMessage() {}

func (x *ListWorkoutsResponse) ProtoReflect() protoreflect.Message {
	mi := &file_api_v1_workouts_proto_msgTypes[7]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use ListWorkoutsResponse.ProtoReflect.Descriptor instead.
func (*ListWorkoutsResponse) Descriptor() ([]byte, []int) {
	return file_api_v1_workouts_proto_rawDescGZIP(), []int{7}
}

func (x *ListWorkoutsResponse) GetWorkouts() []*Workout {
	if x != nil {
		return x.Workouts
	}
	return nil
}

func (x *ListWorkoutsResponse) GetNextPageToken() []byte {
	if x != nil {
		return x.NextPageToken
	}
	return nil
}

type Workout struct {
	state         protoimpl.MessageState
	sizeCache     protoimpl.SizeCache
	unknownFields protoimpl.UnknownFields

	Id           string          `protobuf:"bytes,1,opt,name=id,proto3" json:"id,omitempty"`
	Name         string          `protobuf:"bytes,2,opt,name=name,proto3" json:"name,omitempty"`
	ExerciseSets []*ExerciseSets `protobuf:"bytes,3,rep,name=exercise_sets,json=exerciseSets,proto3" json:"exercise_sets,omitempty"`
}

func (x *Workout) Reset() {
	*x = Workout{}
	mi := &file_api_v1_workouts_proto_msgTypes[8]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *Workout) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*Workout) ProtoMessage() {}

func (x *Workout) ProtoReflect() protoreflect.Message {
	mi := &file_api_v1_workouts_proto_msgTypes[8]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use Workout.ProtoReflect.Descriptor instead.
func (*Workout) Descriptor() ([]byte, []int) {
	return file_api_v1_workouts_proto_rawDescGZIP(), []int{8}
}

func (x *Workout) GetId() string {
	if x != nil {
		return x.Id
	}
	return ""
}

func (x *Workout) GetName() string {
	if x != nil {
		return x.Name
	}
	return ""
}

func (x *Workout) GetExerciseSets() []*ExerciseSets {
	if x != nil {
		return x.ExerciseSets
	}
	return nil
}

type ExerciseSets struct {
	state         protoimpl.MessageState
	sizeCache     protoimpl.SizeCache
	unknownFields protoimpl.UnknownFields

	ExerciseId string `protobuf:"bytes,1,opt,name=exercise_id,json=exerciseId,proto3" json:"exercise_id,omitempty"`
	Sets       []*Set `protobuf:"bytes,2,rep,name=sets,proto3" json:"sets,omitempty"`
}

func (x *ExerciseSets) Reset() {
	*x = ExerciseSets{}
	mi := &file_api_v1_workouts_proto_msgTypes[9]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *ExerciseSets) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*ExerciseSets) ProtoMessage() {}

func (x *ExerciseSets) ProtoReflect() protoreflect.Message {
	mi := &file_api_v1_workouts_proto_msgTypes[9]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use ExerciseSets.ProtoReflect.Descriptor instead.
func (*ExerciseSets) Descriptor() ([]byte, []int) {
	return file_api_v1_workouts_proto_rawDescGZIP(), []int{9}
}

func (x *ExerciseSets) GetExerciseId() string {
	if x != nil {
		return x.ExerciseId
	}
	return ""
}

func (x *ExerciseSets) GetSets() []*Set {
	if x != nil {
		return x.Sets
	}
	return nil
}

type Set struct {
	state         protoimpl.MessageState
	sizeCache     protoimpl.SizeCache
	unknownFields protoimpl.UnknownFields

	Weight float32 `protobuf:"fixed32,1,opt,name=weight,proto3" json:"weight,omitempty"` // The weight can be less than zero.
	Reps   int32   `protobuf:"varint,2,opt,name=reps,proto3" json:"reps,omitempty"`
}

func (x *Set) Reset() {
	*x = Set{}
	mi := &file_api_v1_workouts_proto_msgTypes[10]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *Set) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*Set) ProtoMessage() {}

func (x *Set) ProtoReflect() protoreflect.Message {
	mi := &file_api_v1_workouts_proto_msgTypes[10]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use Set.ProtoReflect.Descriptor instead.
func (*Set) Descriptor() ([]byte, []int) {
	return file_api_v1_workouts_proto_rawDescGZIP(), []int{10}
}

func (x *Set) GetWeight() float32 {
	if x != nil {
		return x.Weight
	}
	return 0
}

func (x *Set) GetReps() int32 {
	if x != nil {
		return x.Reps
	}
	return 0
}

var File_api_v1_workouts_proto protoreflect.FileDescriptor

var file_api_v1_workouts_proto_rawDesc = []byte{
	0x0a, 0x15, 0x61, 0x70, 0x69, 0x2f, 0x76, 0x31, 0x2f, 0x77, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74,
	0x73, 0x2e, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x12, 0x06, 0x61, 0x70, 0x69, 0x2e, 0x76, 0x31, 0x1a,
	0x14, 0x61, 0x70, 0x69, 0x2f, 0x76, 0x31, 0x2f, 0x6f, 0x70, 0x74, 0x69, 0x6f, 0x6e, 0x73, 0x2e,
	0x70, 0x72, 0x6f, 0x74, 0x6f, 0x1a, 0x15, 0x61, 0x70, 0x69, 0x2f, 0x76, 0x31, 0x2f, 0x65, 0x78,
	0x65, 0x72, 0x63, 0x69, 0x73, 0x65, 0x2e, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x1a, 0x1f, 0x67, 0x6f,
	0x6f, 0x67, 0x6c, 0x65, 0x2f, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x62, 0x75, 0x66, 0x2f, 0x74, 0x69,
	0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d, 0x70, 0x2e, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x1a, 0x20, 0x67,
	0x6f, 0x6f, 0x67, 0x6c, 0x65, 0x2f, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x62, 0x75, 0x66, 0x2f, 0x66,
	0x69, 0x65, 0x6c, 0x64, 0x5f, 0x6d, 0x61, 0x73, 0x6b, 0x2e, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x1a,
	0x1b, 0x62, 0x75, 0x66, 0x2f, 0x76, 0x61, 0x6c, 0x69, 0x64, 0x61, 0x74, 0x65, 0x2f, 0x76, 0x61,
	0x6c, 0x69, 0x64, 0x61, 0x74, 0x65, 0x2e, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x22, 0x49, 0x0a, 0x14,
	0x46, 0x69, 0x6e, 0x69, 0x73, 0x68, 0x57, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x52, 0x65, 0x71,
	0x75, 0x65, 0x73, 0x74, 0x12, 0x31, 0x0a, 0x07, 0x77, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x18,
	0x01, 0x20, 0x01, 0x28, 0x0b, 0x32, 0x0f, 0x2e, 0x61, 0x70, 0x69, 0x2e, 0x76, 0x31, 0x2e, 0x57,
	0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x42, 0x06, 0xba, 0x48, 0x03, 0xc8, 0x01, 0x01, 0x52, 0x07,
	0x77, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x22, 0x17, 0x0a, 0x15, 0x46, 0x69, 0x6e, 0x69, 0x73,
	0x68, 0x57, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x52, 0x65, 0x73, 0x70, 0x6f, 0x6e, 0x73, 0x65,
	0x22, 0x2d, 0x0a, 0x11, 0x47, 0x65, 0x74, 0x57, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x52, 0x65,
	0x71, 0x75, 0x65, 0x73, 0x74, 0x12, 0x18, 0x0a, 0x02, 0x69, 0x64, 0x18, 0x01, 0x20, 0x01, 0x28,
	0x09, 0x42, 0x08, 0xba, 0x48, 0x05, 0x72, 0x03, 0xb0, 0x01, 0x01, 0x52, 0x02, 0x69, 0x64, 0x22,
	0x3f, 0x0a, 0x12, 0x47, 0x65, 0x74, 0x57, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x52, 0x65, 0x73,
	0x70, 0x6f, 0x6e, 0x73, 0x65, 0x12, 0x29, 0x0a, 0x07, 0x57, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74,
	0x18, 0x01, 0x20, 0x01, 0x28, 0x0b, 0x32, 0x0f, 0x2e, 0x61, 0x70, 0x69, 0x2e, 0x76, 0x31, 0x2e,
	0x57, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x52, 0x07, 0x57, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74,
	0x22, 0x86, 0x01, 0x0a, 0x14, 0x55, 0x70, 0x64, 0x61, 0x74, 0x65, 0x57, 0x6f, 0x72, 0x6b, 0x6f,
	0x75, 0x74, 0x52, 0x65, 0x71, 0x75, 0x65, 0x73, 0x74, 0x12, 0x31, 0x0a, 0x07, 0x57, 0x6f, 0x72,
	0x6b, 0x6f, 0x75, 0x74, 0x18, 0x01, 0x20, 0x01, 0x28, 0x0b, 0x32, 0x0f, 0x2e, 0x61, 0x70, 0x69,
	0x2e, 0x76, 0x31, 0x2e, 0x57, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x42, 0x06, 0xba, 0x48, 0x03,
	0xc8, 0x01, 0x01, 0x52, 0x07, 0x57, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x12, 0x3b, 0x0a, 0x0b,
	0x75, 0x70, 0x64, 0x61, 0x74, 0x65, 0x5f, 0x6d, 0x61, 0x73, 0x6b, 0x18, 0x02, 0x20, 0x01, 0x28,
	0x0b, 0x32, 0x1a, 0x2e, 0x67, 0x6f, 0x6f, 0x67, 0x6c, 0x65, 0x2e, 0x70, 0x72, 0x6f, 0x74, 0x6f,
	0x62, 0x75, 0x66, 0x2e, 0x46, 0x69, 0x65, 0x6c, 0x64, 0x4d, 0x61, 0x73, 0x6b, 0x52, 0x0a, 0x75,
	0x70, 0x64, 0x61, 0x74, 0x65, 0x4d, 0x61, 0x73, 0x6b, 0x22, 0x42, 0x0a, 0x15, 0x55, 0x70, 0x64,
	0x61, 0x74, 0x65, 0x57, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x52, 0x65, 0x73, 0x70, 0x6f, 0x6e,
	0x73, 0x65, 0x12, 0x29, 0x0a, 0x07, 0x57, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x18, 0x01, 0x20,
	0x01, 0x28, 0x0b, 0x32, 0x0f, 0x2e, 0x61, 0x70, 0x69, 0x2e, 0x76, 0x31, 0x2e, 0x57, 0x6f, 0x72,
	0x6b, 0x6f, 0x75, 0x74, 0x52, 0x07, 0x57, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x22, 0x5c, 0x0a,
	0x13, 0x4c, 0x69, 0x73, 0x74, 0x57, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x73, 0x52, 0x65, 0x71,
	0x75, 0x65, 0x73, 0x74, 0x12, 0x26, 0x0a, 0x09, 0x70, 0x61, 0x67, 0x65, 0x5f, 0x73, 0x69, 0x7a,
	0x65, 0x18, 0x01, 0x20, 0x01, 0x28, 0x05, 0x42, 0x09, 0xba, 0x48, 0x06, 0x1a, 0x04, 0x18, 0x64,
	0x28, 0x01, 0x52, 0x08, 0x70, 0x61, 0x67, 0x65, 0x53, 0x69, 0x7a, 0x65, 0x12, 0x1d, 0x0a, 0x0a,
	0x70, 0x61, 0x67, 0x65, 0x5f, 0x74, 0x6f, 0x6b, 0x65, 0x6e, 0x18, 0x02, 0x20, 0x01, 0x28, 0x0c,
	0x52, 0x09, 0x70, 0x61, 0x67, 0x65, 0x54, 0x6f, 0x6b, 0x65, 0x6e, 0x22, 0x6b, 0x0a, 0x14, 0x4c,
	0x69, 0x73, 0x74, 0x57, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x73, 0x52, 0x65, 0x73, 0x70, 0x6f,
	0x6e, 0x73, 0x65, 0x12, 0x2b, 0x0a, 0x08, 0x77, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x73, 0x18,
	0x01, 0x20, 0x03, 0x28, 0x0b, 0x32, 0x0f, 0x2e, 0x61, 0x70, 0x69, 0x2e, 0x76, 0x31, 0x2e, 0x57,
	0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x52, 0x08, 0x77, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x73,
	0x12, 0x26, 0x0a, 0x0f, 0x6e, 0x65, 0x78, 0x74, 0x5f, 0x70, 0x61, 0x67, 0x65, 0x5f, 0x74, 0x6f,
	0x6b, 0x65, 0x6e, 0x18, 0x02, 0x20, 0x01, 0x28, 0x0c, 0x52, 0x0d, 0x6e, 0x65, 0x78, 0x74, 0x50,
	0x61, 0x67, 0x65, 0x54, 0x6f, 0x6b, 0x65, 0x6e, 0x22, 0x85, 0x01, 0x0a, 0x07, 0x57, 0x6f, 0x72,
	0x6b, 0x6f, 0x75, 0x74, 0x12, 0x18, 0x0a, 0x02, 0x69, 0x64, 0x18, 0x01, 0x20, 0x01, 0x28, 0x09,
	0x42, 0x08, 0xba, 0x48, 0x05, 0x72, 0x03, 0xb0, 0x01, 0x01, 0x52, 0x02, 0x69, 0x64, 0x12, 0x1b,
	0x0a, 0x04, 0x6e, 0x61, 0x6d, 0x65, 0x18, 0x02, 0x20, 0x01, 0x28, 0x09, 0x42, 0x07, 0xba, 0x48,
	0x04, 0x72, 0x02, 0x10, 0x01, 0x52, 0x04, 0x6e, 0x61, 0x6d, 0x65, 0x12, 0x43, 0x0a, 0x0d, 0x65,
	0x78, 0x65, 0x72, 0x63, 0x69, 0x73, 0x65, 0x5f, 0x73, 0x65, 0x74, 0x73, 0x18, 0x03, 0x20, 0x03,
	0x28, 0x0b, 0x32, 0x14, 0x2e, 0x61, 0x70, 0x69, 0x2e, 0x76, 0x31, 0x2e, 0x45, 0x78, 0x65, 0x72,
	0x63, 0x69, 0x73, 0x65, 0x53, 0x65, 0x74, 0x73, 0x42, 0x08, 0xba, 0x48, 0x05, 0x92, 0x01, 0x02,
	0x08, 0x01, 0x52, 0x0c, 0x65, 0x78, 0x65, 0x72, 0x63, 0x69, 0x73, 0x65, 0x53, 0x65, 0x74, 0x73,
	0x22, 0x64, 0x0a, 0x0c, 0x45, 0x78, 0x65, 0x72, 0x63, 0x69, 0x73, 0x65, 0x53, 0x65, 0x74, 0x73,
	0x12, 0x29, 0x0a, 0x0b, 0x65, 0x78, 0x65, 0x72, 0x63, 0x69, 0x73, 0x65, 0x5f, 0x69, 0x64, 0x18,
	0x01, 0x20, 0x01, 0x28, 0x09, 0x42, 0x08, 0xba, 0x48, 0x05, 0x72, 0x03, 0xb0, 0x01, 0x01, 0x52,
	0x0a, 0x65, 0x78, 0x65, 0x72, 0x63, 0x69, 0x73, 0x65, 0x49, 0x64, 0x12, 0x29, 0x0a, 0x04, 0x73,
	0x65, 0x74, 0x73, 0x18, 0x02, 0x20, 0x03, 0x28, 0x0b, 0x32, 0x0b, 0x2e, 0x61, 0x70, 0x69, 0x2e,
	0x76, 0x31, 0x2e, 0x53, 0x65, 0x74, 0x42, 0x08, 0xba, 0x48, 0x05, 0x92, 0x01, 0x02, 0x08, 0x01,
	0x52, 0x04, 0x73, 0x65, 0x74, 0x73, 0x22, 0x3a, 0x0a, 0x03, 0x53, 0x65, 0x74, 0x12, 0x16, 0x0a,
	0x06, 0x77, 0x65, 0x69, 0x67, 0x68, 0x74, 0x18, 0x01, 0x20, 0x01, 0x28, 0x02, 0x52, 0x06, 0x77,
	0x65, 0x69, 0x67, 0x68, 0x74, 0x12, 0x1b, 0x0a, 0x04, 0x72, 0x65, 0x70, 0x73, 0x18, 0x02, 0x20,
	0x01, 0x28, 0x05, 0x42, 0x07, 0xba, 0x48, 0x04, 0x1a, 0x02, 0x28, 0x01, 0x52, 0x04, 0x72, 0x65,
	0x70, 0x73, 0x32, 0xa6, 0x01, 0x0a, 0x0e, 0x57, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x53, 0x65,
	0x72, 0x76, 0x69, 0x63, 0x65, 0x12, 0x4b, 0x0a, 0x06, 0x46, 0x69, 0x6e, 0x69, 0x73, 0x68, 0x12,
	0x1c, 0x2e, 0x61, 0x70, 0x69, 0x2e, 0x76, 0x31, 0x2e, 0x46, 0x69, 0x6e, 0x69, 0x73, 0x68, 0x57,
	0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x52, 0x65, 0x71, 0x75, 0x65, 0x73, 0x74, 0x1a, 0x1d, 0x2e,
	0x61, 0x70, 0x69, 0x2e, 0x76, 0x31, 0x2e, 0x46, 0x69, 0x6e, 0x69, 0x73, 0x68, 0x57, 0x6f, 0x72,
	0x6b, 0x6f, 0x75, 0x74, 0x52, 0x65, 0x73, 0x70, 0x6f, 0x6e, 0x73, 0x65, 0x22, 0x04, 0x88, 0xb5,
	0x18, 0x01, 0x12, 0x47, 0x0a, 0x04, 0x4c, 0x69, 0x73, 0x74, 0x12, 0x1b, 0x2e, 0x61, 0x70, 0x69,
	0x2e, 0x76, 0x31, 0x2e, 0x4c, 0x69, 0x73, 0x74, 0x57, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x73,
	0x52, 0x65, 0x71, 0x75, 0x65, 0x73, 0x74, 0x1a, 0x1c, 0x2e, 0x61, 0x70, 0x69, 0x2e, 0x76, 0x31,
	0x2e, 0x4c, 0x69, 0x73, 0x74, 0x57, 0x6f, 0x72, 0x6b, 0x6f, 0x75, 0x74, 0x73, 0x52, 0x65, 0x73,
	0x70, 0x6f, 0x6e, 0x73, 0x65, 0x22, 0x04, 0x88, 0xb5, 0x18, 0x01, 0x42, 0x94, 0x01, 0x0a, 0x0a,
	0x63, 0x6f, 0x6d, 0x2e, 0x61, 0x70, 0x69, 0x2e, 0x76, 0x31, 0x42, 0x0d, 0x57, 0x6f, 0x72, 0x6b,
	0x6f, 0x75, 0x74, 0x73, 0x50, 0x72, 0x6f, 0x74, 0x6f, 0x50, 0x01, 0x5a, 0x3e, 0x67, 0x69, 0x74,
	0x68, 0x75, 0x62, 0x2e, 0x63, 0x6f, 0x6d, 0x2f, 0x63, 0x72, 0x6c, 0x73, 0x73, 0x6e, 0x2f, 0x67,
	0x65, 0x74, 0x73, 0x74, 0x72, 0x6f, 0x6e, 0x67, 0x65, 0x72, 0x2f, 0x61, 0x70, 0x70, 0x73, 0x2f,
	0x62, 0x61, 0x63, 0x6b, 0x65, 0x6e, 0x64, 0x2f, 0x70, 0x6b, 0x67, 0x2f, 0x70, 0x62, 0x2f, 0x61,
	0x70, 0x69, 0x2f, 0x76, 0x31, 0x3b, 0x61, 0x70, 0x69, 0x76, 0x31, 0xa2, 0x02, 0x03, 0x41, 0x58,
	0x58, 0xaa, 0x02, 0x06, 0x41, 0x70, 0x69, 0x2e, 0x56, 0x31, 0xca, 0x02, 0x06, 0x41, 0x70, 0x69,
	0x5c, 0x56, 0x31, 0xe2, 0x02, 0x12, 0x41, 0x70, 0x69, 0x5c, 0x56, 0x31, 0x5c, 0x47, 0x50, 0x42,
	0x4d, 0x65, 0x74, 0x61, 0x64, 0x61, 0x74, 0x61, 0xea, 0x02, 0x07, 0x41, 0x70, 0x69, 0x3a, 0x3a,
	0x56, 0x31, 0x62, 0x06, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x33,
}

var (
	file_api_v1_workouts_proto_rawDescOnce sync.Once
	file_api_v1_workouts_proto_rawDescData = file_api_v1_workouts_proto_rawDesc
)

func file_api_v1_workouts_proto_rawDescGZIP() []byte {
	file_api_v1_workouts_proto_rawDescOnce.Do(func() {
		file_api_v1_workouts_proto_rawDescData = protoimpl.X.CompressGZIP(file_api_v1_workouts_proto_rawDescData)
	})
	return file_api_v1_workouts_proto_rawDescData
}

var file_api_v1_workouts_proto_msgTypes = make([]protoimpl.MessageInfo, 11)
var file_api_v1_workouts_proto_goTypes = []any{
	(*FinishWorkoutRequest)(nil),  // 0: api.v1.FinishWorkoutRequest
	(*FinishWorkoutResponse)(nil), // 1: api.v1.FinishWorkoutResponse
	(*GetWorkoutRequest)(nil),     // 2: api.v1.GetWorkoutRequest
	(*GetWorkoutResponse)(nil),    // 3: api.v1.GetWorkoutResponse
	(*UpdateWorkoutRequest)(nil),  // 4: api.v1.UpdateWorkoutRequest
	(*UpdateWorkoutResponse)(nil), // 5: api.v1.UpdateWorkoutResponse
	(*ListWorkoutsRequest)(nil),   // 6: api.v1.ListWorkoutsRequest
	(*ListWorkoutsResponse)(nil),  // 7: api.v1.ListWorkoutsResponse
	(*Workout)(nil),               // 8: api.v1.Workout
	(*ExerciseSets)(nil),          // 9: api.v1.ExerciseSets
	(*Set)(nil),                   // 10: api.v1.Set
	(*fieldmaskpb.FieldMask)(nil), // 11: google.protobuf.FieldMask
}
var file_api_v1_workouts_proto_depIdxs = []int32{
	8,  // 0: api.v1.FinishWorkoutRequest.workout:type_name -> api.v1.Workout
	8,  // 1: api.v1.GetWorkoutResponse.Workout:type_name -> api.v1.Workout
	8,  // 2: api.v1.UpdateWorkoutRequest.Workout:type_name -> api.v1.Workout
	11, // 3: api.v1.UpdateWorkoutRequest.update_mask:type_name -> google.protobuf.FieldMask
	8,  // 4: api.v1.UpdateWorkoutResponse.Workout:type_name -> api.v1.Workout
	8,  // 5: api.v1.ListWorkoutsResponse.workouts:type_name -> api.v1.Workout
	9,  // 6: api.v1.Workout.exercise_sets:type_name -> api.v1.ExerciseSets
	10, // 7: api.v1.ExerciseSets.sets:type_name -> api.v1.Set
	0,  // 8: api.v1.WorkoutService.Finish:input_type -> api.v1.FinishWorkoutRequest
	6,  // 9: api.v1.WorkoutService.List:input_type -> api.v1.ListWorkoutsRequest
	1,  // 10: api.v1.WorkoutService.Finish:output_type -> api.v1.FinishWorkoutResponse
	7,  // 11: api.v1.WorkoutService.List:output_type -> api.v1.ListWorkoutsResponse
	10, // [10:12] is the sub-list for method output_type
	8,  // [8:10] is the sub-list for method input_type
	8,  // [8:8] is the sub-list for extension type_name
	8,  // [8:8] is the sub-list for extension extendee
	0,  // [0:8] is the sub-list for field type_name
}

func init() { file_api_v1_workouts_proto_init() }
func file_api_v1_workouts_proto_init() {
	if File_api_v1_workouts_proto != nil {
		return
	}
	file_api_v1_options_proto_init()
	file_api_v1_exercise_proto_init()
	type x struct{}
	out := protoimpl.TypeBuilder{
		File: protoimpl.DescBuilder{
			GoPackagePath: reflect.TypeOf(x{}).PkgPath(),
			RawDescriptor: file_api_v1_workouts_proto_rawDesc,
			NumEnums:      0,
			NumMessages:   11,
			NumExtensions: 0,
			NumServices:   1,
		},
		GoTypes:           file_api_v1_workouts_proto_goTypes,
		DependencyIndexes: file_api_v1_workouts_proto_depIdxs,
		MessageInfos:      file_api_v1_workouts_proto_msgTypes,
	}.Build()
	File_api_v1_workouts_proto = out.File
	file_api_v1_workouts_proto_rawDesc = nil
	file_api_v1_workouts_proto_goTypes = nil
	file_api_v1_workouts_proto_depIdxs = nil
}