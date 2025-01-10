import type { DateTimeMaybeValid } from 'luxon/src/datetime'
import type { FieldMask, Timestamp } from '@bufbuild/protobuf/wkt'
import type { Exercise, ExerciseSets } from '@/proto/api/v1/shared_pb.ts'

import router from '@/router/router.ts'
import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { Error, ErrorDetailSchema } from '@/proto/api/v1/errors_pb'
import {
  ListFeedItemsRequestSchema,
  type ListFeedItemsResponse,
} from '@/proto/api/v1/feed_service_pb.ts'
import {
  ListNotificationsRequestSchema,
  type ListNotificationsResponse,
  MarkNotificationsAsReadRequestSchema,
  type MarkNotificationsAsReadResponse,
} from '@/proto/api/v1/notification_service_pb.ts'
import {
  FollowUserRequestSchema,
  type FollowUserResponse,
  GetUserRequestSchema,
  type GetUserResponse,
  ListFolloweesRequestSchema,
  type ListFolloweesResponse,
  ListFollowersRequestSchema,
  type ListFollowersResponse,
  SearchUsersRequestSchema,
  type SearchUsersResponse,
  UnfollowUserRequestSchema,
  type UnfollowUserResponse,
} from '@/proto/api/v1/user_service_pb.ts'
import {
  CreateRoutineRequestSchema,
  type CreateRoutineResponse,
  DeleteRoutineRequestSchema,
  type DeleteRoutineResponse,
  GetRoutineRequestSchema,
  type GetRoutineResponse,
  ListRoutinesRequestSchema,
  type ListRoutinesResponse,
  UpdateExerciseOrderRequestSchema,
  type UpdateExerciseOrderResponse,
  UpdateRoutineRequestSchema,
  type UpdateRoutineResponse,
} from '@/proto/api/v1/routine_service_pb'
import {
  CreateWorkoutRequestSchema,
  type CreateWorkoutResponse,
  DeleteWorkoutRequestSchema,
  type DeleteWorkoutResponse,
  GetWorkoutRequestSchema,
  type GetWorkoutResponse,
  ListWorkoutsRequestSchema,
  type ListWorkoutsResponse,
  PostCommentRequestSchema,
  type PostCommentResponse,
  UpdateWorkoutRequestSchema,
  type UpdateWorkoutResponse,
  type Workout,
} from '@/proto/api/v1/workout_service_pb'
import {
  LoginRequestSchema,
  type LoginResponse,
  LogoutRequestSchema,
  type LogoutResponse,
  RefreshTokenRequestSchema,
  type RefreshTokenResponse,
  type ResetPasswordRequest,
  ResetPasswordRequestSchema,
  type ResetPasswordResponse,
  type SignupRequest,
  SignupRequestSchema,
  type SignupResponse,
  type UpdatePasswordRequest,
  UpdatePasswordRequestSchema,
  type UpdatePasswordResponse,
  VerifyEmailRequestSchema,
  type VerifyEmailResponse,
} from '@/proto/api/v1/auth_service_pb'
import {
  type CreateExerciseRequest,
  CreateExerciseRequestSchema,
  type CreateExerciseResponse,
  DeleteExerciseRequestSchema,
  type DeleteExerciseResponse,
  GetExerciseRequestSchema,
  type GetExerciseResponse,
  GetPersonalBestsRequestSchema,
  type GetPersonalBestsResponse,
  GetPreviousWorkoutSetsRequestSchema,
  type GetPreviousWorkoutSetsResponse,
  ListExercisesRequestSchema,
  type ListExercisesResponse,
  ListSetsRequestSchema,
  type ListSetsResponse,
  UpdateExerciseRequestSchema,
  type UpdateExerciseResponse,
} from '@/proto/api/v1/exercise_service_pb'

import {
  authClient,
  exerciseClient,
  feedClient,
  notificationClient,
  routineClient,
  userClient,
  workoutClient,
} from './clients'
import { useAuthStore } from '@/stores/auth.ts'

const defaultPageLimit = 25

export const deleteWorkout = async (id: string): Promise<DeleteWorkoutResponse | void> => {
  const req = create(DeleteWorkoutRequestSchema, {
    id: id,
  })

  return tryCatch(() => workoutClient.deleteWorkout(req))
}

export const deleteExercise = async (id: string): Promise<DeleteExerciseResponse | void> => {
  const req = create(DeleteExerciseRequestSchema, {
    id: id,
  })

  return tryCatch(() => exerciseClient.deleteExercise(req))
}

export const deleteRoutine = async (id: string): Promise<DeleteRoutineResponse | void> => {
  const req = create(DeleteRoutineRequestSchema, {
    id: id,
  })

  return tryCatch(() => routineClient.deleteRoutine(req))
}

export const login = async (email: string, password: string): Promise<LoginResponse | void> => {
  const req = create(LoginRequestSchema, {
    email: email,
    password: password,
  })

  return tryCatch(() => authClient.login(req))
}

export const logout = async (): Promise<LogoutResponse | void> => {
  const req = create(LogoutRequestSchema, {})
  return tryCatch(() => authClient.logout(req))
}

export const refreshToken = async (): Promise<RefreshTokenResponse | void> => {
  const req = create(RefreshTokenRequestSchema, {})
  return tryCatch(() => authClient.refreshToken(req))
}

export const signup = async (request: SignupRequest): Promise<SignupResponse | void> => {
  const req = create(SignupRequestSchema, request)
  return tryCatch(() => authClient.signup(req))
}

export const verifyEmail = async (token: string): Promise<VerifyEmailResponse | void> => {
  const req = create(VerifyEmailRequestSchema, {
    token: token,
  })

  return tryCatch(() => authClient.verifyEmail(req))
}

export const resetPassword = async (
  request: ResetPasswordRequest,
): Promise<ResetPasswordResponse | void> => {
  const req = create(ResetPasswordRequestSchema, request)
  return tryCatch(() => authClient.resetPassword(req))
}

export const updatePassword = async (
  request: UpdatePasswordRequest,
): Promise<UpdatePasswordResponse | void> => {
  const req = create(UpdatePasswordRequestSchema, request)
  return tryCatch(() => authClient.updatePassword(req))
}

export const getExercise = async (id: string): Promise<GetExerciseResponse | void> => {
  const req = create(GetExerciseRequestSchema, {
    id: id,
  })
  return tryCatch(() => exerciseClient.getExercise(req))
}

export const createExercise = async (
  request: CreateExerciseRequest,
): Promise<CreateExerciseResponse | void> => {
  const req = create(CreateExerciseRequestSchema, request)
  return tryCatch(() => exerciseClient.createExercise(req))
}

export const listSets = async (
  userIds: string[],
  exerciseIds: string[],
  pageToken: Uint8Array,
  pageLimit: number = defaultPageLimit,
): Promise<ListSetsResponse | void> => {
  const req = create(ListSetsRequestSchema, {
    userIds: userIds,
    exerciseIds: exerciseIds,
    pagination: {
      pageLimit: pageLimit,
      pageToken: pageToken,
    },
  })
  return tryCatch(() => exerciseClient.listSets(req))
}

export const getRoutine = async (id: string): Promise<GetRoutineResponse | void> => {
  const req = create(GetRoutineRequestSchema, {
    id: id,
  })
  return tryCatch(() => routineClient.getRoutine(req))
}

export const listExercises = async (
  pageToken: Uint8Array,
): Promise<ListExercisesResponse | void> => {
  const req = create(ListExercisesRequestSchema, {
    exerciseIds: [],
    name: '',
    pagination: {
      pageLimit: defaultPageLimit,
      pageToken: pageToken,
    },
  })
  return tryCatch(() => exerciseClient.listExercises(req))
}

export const createRoutine = async (
  name: string,
  exerciseIds: string[],
): Promise<CreateRoutineResponse | void> => {
  const req = create(CreateRoutineRequestSchema, {
    exerciseIds: exerciseIds,
    name: name,
  })
  return tryCatch(() => routineClient.createRoutine(req))
}

export const updateRoutine = async (
  id: string,
  name: string,
  exerciseIds: string[],
): Promise<UpdateRoutineResponse | void> => {
  const exercises: Exercise[] = exerciseIds.map((id) => ({ id: id }) as Exercise)
  const req = create(UpdateRoutineRequestSchema, {
    routine: {
      exercises: exercises,
      id: id,
      name: name,
    },
  })
  return tryCatch(() => routineClient.updateRoutine(req))
}

export const updateExercise = async (
  id: string,
  name: string,
  label: string,
): Promise<UpdateExerciseResponse | void> => {
  const req = create(UpdateExerciseRequestSchema, {
    exercise: {
      id: id,
      label: label,
      name: name,
    } as Exercise,
    updateMask: {
      paths: ['name', 'label'],
    } as FieldMask,
  })
  return tryCatch(() => exerciseClient.updateExercise(req))
}

export const createWorkout = async (
  routineId: string,
  exerciseSets: ExerciseSets[],
  startedAt: DateTimeMaybeValid,
  finishedAt: DateTimeMaybeValid,
): Promise<CreateWorkoutResponse | void> => {
  const req = create(CreateWorkoutRequestSchema, {
    exerciseSets: exerciseSets,
    finishedAt: {
      seconds: BigInt(finishedAt.toSeconds()),
    } as Timestamp,
    routineId: routineId,
    startedAt: {
      seconds: BigInt(startedAt.toSeconds()),
    } as Timestamp,
  })
  return tryCatch(() => workoutClient.createWorkout(req))
}

export const updateWorkout = async (workout: Workout): Promise<UpdateWorkoutResponse | void> => {
  const req = create(UpdateWorkoutRequestSchema, {
    workout: workout,
  })
  return tryCatch(() => workoutClient.updateWorkout(req))
}

export const getWorkout = async (id: string): Promise<GetWorkoutResponse | void> => {
  const req = create(GetWorkoutRequestSchema, {
    id: id,
  })
  return tryCatch(() => workoutClient.getWorkout(req))
}

export const listFeedItems = async (
  pageToken: Uint8Array,
  followedOnly: boolean,
): Promise<ListFeedItemsResponse | void> => {
  const req = create(ListFeedItemsRequestSchema, {
    followedOnly,
    pagination: {
      pageLimit: defaultPageLimit,
      pageToken: pageToken,
    },
  })
  return tryCatch(() => feedClient.listFeedItems(req))
}

export const getUser = async (id: string): Promise<GetUserResponse | void> => {
  const req = create(GetUserRequestSchema, {
    id: id,
  })
  return tryCatch(() => userClient.getUser(req))
}

export const searchUsers = async (
  query: string,
  pageToken: Uint8Array,
): Promise<SearchUsersResponse | void> => {
  const req = create(SearchUsersRequestSchema, {
    pagination: {
      pageLimit: 5,
      pageToken: pageToken,
    },
    query: query,
  })
  return tryCatch(() => userClient.searchUsers(req))
}

export const listFollowers = async (followerId: string): Promise<ListFollowersResponse | void> => {
  const req = create(ListFollowersRequestSchema, {
    followerId: followerId,
  })
  return tryCatch(() => userClient.listFollowers(req))
}

export const listFollowees = async (followeeId: string): Promise<ListFolloweesResponse | void> => {
  const req = create(ListFolloweesRequestSchema, {
    followeeId: followeeId,
  })
  return tryCatch(() => userClient.listFollowees(req))
}

export const followUser = async (followId: string): Promise<FollowUserResponse | void> => {
  const req = create(FollowUserRequestSchema, {
    followId: followId,
  })
  return tryCatch(() => userClient.followUser(req))
}

export const unfollowUser = async (unfollowId: string): Promise<UnfollowUserResponse | void> => {
  const req = create(UnfollowUserRequestSchema, {
    unfollowId: unfollowId,
  })
  return tryCatch(() => userClient.unfollowUser(req))
}

export const listRoutines = async (pageToken: Uint8Array): Promise<ListRoutinesResponse | void> => {
  const req = create(ListRoutinesRequestSchema, {
    name: '',
    pagination: {
      pageLimit: defaultPageLimit,
      pageToken: pageToken,
    },
  })
  return tryCatch(() => routineClient.listRoutines(req))
}

export const updateExerciseOrder = async (
  routineId: string,
  exerciseIds: string[],
): Promise<UpdateExerciseOrderResponse | void> => {
  const req = create(UpdateExerciseOrderRequestSchema, {
    exerciseIds: exerciseIds,
    routineId: routineId,
  })
  return tryCatch(() => routineClient.updateExerciseOrder(req))
}

export const listNotifications = async (
  pageToken: Uint8Array,
): Promise<ListNotificationsResponse | void> => {
  const req = create(ListNotificationsRequestSchema, {
    pagination: {
      pageLimit: defaultPageLimit,
      pageToken: pageToken,
    },
  })
  return tryCatch(() => notificationClient.listNotifications(req))
}

export const markNotificationAsRead = async (): Promise<MarkNotificationsAsReadResponse | void> => {
  const req = create(MarkNotificationsAsReadRequestSchema, {})
  return tryCatch(() => notificationClient.markNotificationsAsRead(req))
}

export const listWorkouts = async (
  userIds: string[],
  pageToken: Uint8Array,
): Promise<ListWorkoutsResponse | void> => {
  const req = create(ListWorkoutsRequestSchema, {
    pagination: {
      pageLimit: defaultPageLimit,
      pageToken: pageToken,
    },
    userIds: userIds,
  })
  return tryCatch(() => workoutClient.listWorkouts(req))
}

export const postWorkoutComment = async (
  workoutId: string,
  comment: string,
): Promise<PostCommentResponse | void> => {
  const req = create(PostCommentRequestSchema, {
    comment: comment,
    workoutId: workoutId,
  })
  return tryCatch(() => workoutClient.postComment(req))
}

export const getPersonalBests = async (
  userId: string,
): Promise<GetPersonalBestsResponse | void> => {
  const req = create(GetPersonalBestsRequestSchema, {
    userId: userId,
  })
  return tryCatch(() => exerciseClient.getPersonalBests(req))
}

export const getPreviousWorkoutSets = async (
  exerciseIds: string[],
): Promise<GetPreviousWorkoutSetsResponse | void> => {
  const req = create(GetPreviousWorkoutSetsRequestSchema, {
    exerciseIds: exerciseIds,
  })
  return tryCatch(() => exerciseClient.getPreviousWorkoutSets(req))
}

const tryCatch = async <T>(fn: () => Promise<T>): Promise<T | void> => {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof ConnectError) {
      if (error.code === Code.Unauthenticated) {
        try {
          console.warn('user unauthenticated: refreshing token')
          const req = create(RefreshTokenRequestSchema, {})
          const res = await authClient.refreshToken(req)

          const authStore = useAuthStore()
          authStore.setAccessToken(res.accessToken)

          console.log('retrying original request')
          return await fn()
        } catch (e) {
          console.warn('token refresh failed: logging out', e)
          await router.push('/logout')
        }
      }

      for (const detail of error.findDetails(ErrorDetailSchema)) {
        switch (detail.error) {
          case Error.EMAIL_NOT_VERIFIED:
            alert('You must verify your email before logging in')
            return
          case Error.PASSWORDS_DO_NOT_MATCH:
            alert('Passwords do not match')
            return
        }
      }

      // DEBT: Filter out some error codes to alert the user until we have a better way to handle errors.
      const ignoredCodes: Code[] = [Code.Unauthenticated, Code.Unavailable, Code.Canceled]
      if (!ignoredCodes.includes(error.code)) {
        alert(`${error.code}: ${error.message}`)
        return
      }
    }

    // TODO: Use custom alert component.
    console.error('request', error)
  }
}
