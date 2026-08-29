import { type FieldMask } from '@bufbuild/protobuf/wkt'
import type { RoutineExercise, RoutineGroup } from '@/proto/api/v1/routine_service_pb'
import type { DistanceUnit, Exercise, WeightUnit } from '@/proto/api/v1/shared_pb'

import { RoutineGroupMode } from '@/proto/api/v1/shared_pb'
import type { DraftGroup } from '@/utils/routineGroups'

import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { Error, ErrorDetailSchema } from '@/proto/api/v1/errors_pb'
import {
  ListFeedItemsRequestSchema,
  type ListFeedItemsResponse,
} from '@/proto/api/v1/feed_service_pb'
import {
  ListNotificationsRequestSchema,
  type ListNotificationsResponse,
  MarkNotificationsAsReadRequestSchema,
  type MarkNotificationsAsReadResponse,
} from '@/proto/api/v1/notification_service_pb'
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
  UpdateUserAutofillSetsRequestSchema,
  type UpdateUserAutofillSetsResponse,
  UpdateUserDistanceUnitRequestSchema,
  type UpdateUserDistanceUnitResponse,
  UpdateUserNameRequestSchema,
  type UpdateUserNameResponse,
  UpdateUserUsernameRequestSchema,
  type UpdateUserUsernameResponse,
  UpdateUserWeightUnitRequestSchema,
  type UpdateUserWeightUnitResponse,
} from '@/proto/api/v1/user_service_pb'
import {
  CreatePlanRequestSchema,
  type CreatePlanResponse,
  CreateRoutineRequestSchema,
  type CreateRoutineResponse,
  DeletePlanRequestSchema,
  type DeletePlanResponse,
  DeleteRoutineRequestSchema,
  type DeleteRoutineResponse,
  GetDashboardRequestSchema,
  type GetDashboardResponse,
  GetPlanRequestSchema,
  type GetPlanResponse,
  GetRoutineRequestSchema,
  type GetRoutineResponse,
  ListPlansRequestSchema,
  type ListPlansResponse,
  ListRoutinesRequestSchema,
  type ListRoutinesResponse,
  PauseActivePlanRequestSchema,
  type PauseActivePlanResponse,
  SetActivePlanRequestSchema,
  type SetActivePlanResponse,
  SkipPlanRoutineRequestSchema,
  type SkipPlanRoutineResponse,
  UpdateExerciseOrderRequestSchema,
  type UpdateExerciseOrderResponse,
  UpdatePlanRequestSchema,
  type UpdatePlanResponse,
  UpdateRoutineRequestSchema,
  type UpdateRoutineResponse,
} from '@/proto/api/v1/routine_service_pb'
import {
  type CreateWorkoutRequest,
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
  DeleteAccountRequestSchema,
  type DeleteAccountResponse,
  LoginRequestSchema,
  type LoginResponse,
  LogoutRequestSchema,
  type LogoutResponse,
  RefreshTokenRequestSchema,
  type RefreshTokenResponse,
  ResendVerificationEmailRequestSchema,
  type ResendVerificationEmailResponse,
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
import { i18n } from '@/i18n'
import { isConnectivityError } from '@/http/offlineCache'
import { logoutUnauthenticatedUser } from '@/http/unauthenticated'
import { currentPath, goTo } from '@/router/navigation'
import { useConnectionStore } from '@/stores/connection'
import { useEmailVerificationStore } from '@/stores/emailVerification'

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

export const deletePlan = async (id: string): Promise<DeletePlanResponse | void> => {
  const req = create(DeletePlanRequestSchema, { id })
  return tryCatch(() => routineClient.deletePlan(req))
}

export const login = async (email: string, password: string): Promise<LoginResponse | void> => {
  const req = create(LoginRequestSchema, {
    email: email,
    password: password,
  })

  return tryCatch(() => authClient.login(req), {
    // An unverified account is not a dead end: send the user to the page that
    // explains the pending state and can resend the verification email.
    onEmailNotVerified: () => redirectToPendingVerification(email),
  })
}

export const resendVerificationEmail = async (
  email: string,
): Promise<ResendVerificationEmailResponse | void> => {
  const req = create(ResendVerificationEmailRequestSchema, {
    email: email,
  })

  // Failures are surfaced by the pending verification page itself, which can
  // offer a retry instead of interrupting with a native dialog.
  return tryCatch(() => authClient.resendVerificationEmail(req), { ignoreErrors: true })
}

export const verifyEmailPendingPath = '/verify-email/pending'

const redirectToPendingVerification = async (email: string): Promise<void> => {
  useEmailVerificationStore.getState().setPendingEmail(email)
  if (currentPath() === verifyEmailPendingPath) return
  await goTo(verifyEmailPendingPath)
}

export const logout = async (): Promise<LogoutResponse | void> => {
  const req = create(LogoutRequestSchema, {})
  return tryCatch(() => authClient.logout(req))
}

/**
 * Deletes the signed-in account, irreversibly.
 *
 * Errors are rethrown rather than alerted: the only one the caller expects is
 * a wrong password, which belongs beside the field rather than in a toast.
 */
export const deleteAccount = async (password: string): Promise<DeleteAccountResponse | void> => {
  const req = create(DeleteAccountRequestSchema, { password })
  return tryCatch(() => authClient.deleteAccount(req), { rethrow: true })
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

export const getPlan = async (id: string): Promise<GetPlanResponse | void> => {
  const req = create(GetPlanRequestSchema, { id })
  return tryCatch(() => routineClient.getPlan(req))
}

export const listPlans = async (): Promise<ListPlansResponse | void> => {
  const req = create(ListPlansRequestSchema, {})
  return tryCatch(() => routineClient.listPlans(req))
}

export const getDashboard = async (
  preferredRoutineId: string,
): Promise<GetDashboardResponse | void> => {
  const req = create(GetDashboardRequestSchema, {
    preferredRoutineId,
  })
  return tryCatch(() => routineClient.getDashboard(req))
}

export const listExercises = async (
  pageToken: Uint8Array,
  name = '',
): Promise<ListExercisesResponse | void> => {
  const req = create(ListExercisesRequestSchema, {
    exerciseIds: [],
    name: name,
    pagination: {
      pageLimit: defaultPageLimit,
      pageToken: pageToken,
    },
  })
  return tryCatch(() => exerciseClient.listExercises(req))
}

export const listExerciseTags = async (): Promise<string[]> => {
  const tags = new Map<string, string>()
  const seenPageTokens = new Set<string>()
  let pageToken: Uint8Array = new Uint8Array(0)

  while (true) {
    const response = await listExercises(pageToken)
    if (!response) break

    for (const exercise of response.exercises) {
      for (const tag of exercise.tags) {
        const normalized = tag.trim()
        if (normalized) tags.set(normalized.toLowerCase(), normalized)
      }
    }

    const nextPageToken = response.pagination?.nextPageToken ?? new Uint8Array(0)
    if (!nextPageToken.length) break

    const tokenKey = Array.from(nextPageToken).join(',')
    if (seenPageTokens.has(tokenKey)) break
    seenPageTokens.add(tokenKey)
    pageToken = nextPageToken
  }

  return [...tags.values()].sort((left, right) => left.localeCompare(right))
}

// The groups say how the exercises are worked through. A routine that is one
// plain block sends none, which is what every routine sent before grouping.
const routineGroupMessages = (groups: readonly DraftGroup[] | undefined): RoutineGroup[] =>
  (groups ?? []).map(
    (group) =>
      ({
        mode: group.mode === 'circuit' ? RoutineGroupMode.CIRCUIT : RoutineGroupMode.STRAIGHT,
        restBetweenExercisesSeconds: group.restBetweenExercisesSeconds,
        restBetweenRoundsSeconds: group.restBetweenRoundsSeconds,
        rounds: group.rounds,
        exercises: group.entries.map(
          (entry) =>
            ({
              exercise: { id: entry.exerciseId } as Exercise,
              restSeconds: entry.restSeconds,
            }) as RoutineExercise,
        ),
      }) as RoutineGroup,
  )

export const createRoutine = async (
  name: string,
  exerciseIds: string[],
  groups?: readonly DraftGroup[],
): Promise<CreateRoutineResponse | void> => {
  const req = create(CreateRoutineRequestSchema, {
    exerciseIds: exerciseIds,
    name: name,
    groups: routineGroupMessages(groups),
  })
  return tryCatch(() => routineClient.createRoutine(req))
}

export const createPlan = async (
  name: string,
  routineIds: string[],
): Promise<CreatePlanResponse | void> => {
  const req = create(CreatePlanRequestSchema, { name, routineIds })
  return tryCatch(() => routineClient.createPlan(req))
}

export const updatePlan = async (
  id: string,
  name: string,
  routineIds: string[],
): Promise<UpdatePlanResponse | void> => {
  const req = create(UpdatePlanRequestSchema, {
    id,
    name,
    routineIds,
  })
  return tryCatch(() => routineClient.updatePlan(req))
}

export const setActivePlan = async (id: string): Promise<SetActivePlanResponse | void> => {
  const req = create(SetActivePlanRequestSchema, { id })
  return tryCatch(() => routineClient.setActivePlan(req))
}

export const pauseActivePlan = async (): Promise<PauseActivePlanResponse | void> => {
  const req = create(PauseActivePlanRequestSchema, {})
  return tryCatch(() => routineClient.pauseActivePlan(req))
}

export const skipPlanRoutine = async (id: string): Promise<SkipPlanRoutineResponse | void> => {
  const req = create(SkipPlanRoutineRequestSchema, { id })
  return tryCatch(() => routineClient.skipPlanRoutine(req))
}

export const updateRoutine = async (
  id: string,
  name: string,
  exerciseIds: string[],
  groups?: readonly DraftGroup[],
): Promise<UpdateRoutineResponse | void> => {
  const exercises: Exercise[] = exerciseIds.map((id) => ({ id: id }) as Exercise)
  const req = create(UpdateRoutineRequestSchema, {
    routine: {
      exercises: exercises,
      id: id,
      name: name,
      groups: routineGroupMessages(groups),
    },
  })
  return tryCatch(() => routineClient.updateRoutine(req))
}

export const updateExercise = async (
  exercise: Exercise,
): Promise<UpdateExerciseResponse | void> => {
  const req = create(UpdateExerciseRequestSchema, {
    exercise,
    updateMask: {
      paths: ['name', 'tags', 'metrics'],
    } as FieldMask,
  })
  return tryCatch(() => exerciseClient.updateExercise(req))
}

// The caller builds the request so a copy of it can be queued for later
// delivery when the save fails offline.
export const createWorkout = async (
  req: CreateWorkoutRequest,
): Promise<CreateWorkoutResponse | void> => {
  return tryCatch(() => workoutClient.createWorkout(req, { timeoutMs: 15_000 }), {
    rethrow: true,
  })
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

export const getCurrentUser = async (id: string): Promise<GetUserResponse | void> => {
  const req = create(GetUserRequestSchema, { id })
  return tryCatch(() => userClient.getUser(req), { invalidatesSessionOnNotFound: true })
}

export const updateUserName = async (name: string): Promise<UpdateUserNameResponse | void> => {
  const req = create(UpdateUserNameRequestSchema, { name })
  return tryCatch(() => userClient.updateUserName(req))
}

export const updateUserUsername = async (
  username: string,
): Promise<UpdateUserUsernameResponse | void> => {
  const req = create(UpdateUserUsernameRequestSchema, { username })
  return tryCatch(() => userClient.updateUserUsername(req))
}

export const updateUserWeightUnit = async (
  weightUnit: WeightUnit,
): Promise<UpdateUserWeightUnitResponse | void> => {
  const req = create(UpdateUserWeightUnitRequestSchema, { weightUnit })
  return tryCatch(() => userClient.updateUserWeightUnit(req))
}

export const updateUserAutofillSets = async (
  enabled: boolean,
): Promise<UpdateUserAutofillSetsResponse | void> => {
  const req = create(UpdateUserAutofillSetsRequestSchema, { enabled })
  return tryCatch(() => userClient.updateUserAutofillSets(req))
}

export const updateUserDistanceUnit = async (
  distanceUnit: DistanceUnit,
): Promise<UpdateUserDistanceUnitResponse | void> => {
  const req = create(UpdateUserDistanceUnitRequestSchema, { distanceUnit })
  return tryCatch(() => userClient.updateUserDistanceUnit(req))
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

export const listFollowers = async (userId: string): Promise<ListFollowersResponse | void> => {
  const req = create(ListFollowersRequestSchema, {
    userId: userId,
  })
  return tryCatch(() => userClient.listFollowers(req))
}

export const listFollowees = async (userId: string): Promise<ListFolloweesResponse | void> => {
  const req = create(ListFolloweesRequestSchema, {
    userId: userId,
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

export const listRoutines = async (
  pageToken: Uint8Array,
  name = '',
): Promise<ListRoutinesResponse | void> => {
  const req = create(ListRoutinesRequestSchema, {
    name: name,
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

export const markNotificationAsRead = async (
  notificationId?: string,
  ignoreErrors = false,
): Promise<MarkNotificationsAsReadResponse | void> => {
  const req = create(MarkNotificationsAsReadRequestSchema, { notificationId })
  return tryCatch(() => notificationClient.markNotificationsAsRead(req), { ignoreErrors })
}

export const listWorkouts = async (
  userIds: string[],
  pageToken: Uint8Array,
  pageLimit: number = defaultPageLimit,
): Promise<ListWorkoutsResponse | void> => {
  const req = create(ListWorkoutsRequestSchema, {
    pagination: {
      pageLimit: pageLimit,
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

type TryCatchOptions = {
  ignoreErrors?: boolean
  invalidatesSessionOnNotFound?: boolean
  onEmailNotVerified?: () => Promise<void>
  rethrow?: boolean
}

// Errors render inline rather than toasting, and the caller owns the inline
// slot, so a request that returns void leaves its message here for the caller
// to collect. One slot suffices: requests follow user actions, one at a time.
let requestErrorMessage: string | undefined

/** The message the request that just returned void failed with, then clears it. */
export const consumeRequestError = (): string | undefined => {
  const message = requestErrorMessage
  requestErrorMessage = undefined
  return message
}

const tryCatch = async <T>(
  fn: () => Promise<T>,
  options: TryCatchOptions = {},
): Promise<T | void> => {
  requestErrorMessage = undefined
  try {
    return await fn()
  } catch (error) {
    if (options.ignoreErrors) return

    if (error instanceof ConnectError) {
      if (
        error.code === Code.Unauthenticated ||
        (options.invalidatesSessionOnNotFound && error.code === Code.NotFound)
      ) {
        console.warn('user session invalid: logging out')
        await logoutUnauthenticatedUser()
        return
      }

      if (options.rethrow) throw error

      for (const detail of error.findDetails(ErrorDetailSchema)) {
        switch (detail.error) {
          case Error.EMAIL_NOT_VERIFIED:
            await options.onEmailNotVerified?.()
            return
          case Error.PASSWORDS_DO_NOT_MATCH:
            requestErrorMessage = i18n.t('auth.passwordsDoNotMatch')
            return
          case Error.USERNAME_TAKEN:
            requestErrorMessage = i18n.t('auth.usernameTaken')
            return
        }
      }

      // An application error says something the user can act on, so it is
      // kept as it came. Cancelled and unreachable are neither: they fall
      // through to the connectivity handling below.
      if (error.code !== Code.Canceled && !isConnectivityError(error)) {
        // An Unknown carries a transport message ("[unknown] Failed to
        // fetch"), which tells the user nothing they can do anything with.
        requestErrorMessage =
          error.code === Code.Unknown ? i18n.t('common.somethingWentWrong') : error.message
        return
      }
    }

    console.error('request', error)
    if (options.rethrow) throw error

    // A request that never reached the backend used to end here in silence, and
    // the callers turned that silence into "nothing here yet".
    //
    // The offline banner marks the moment connectivity went and carries the
    // state from there on; the recorded message lets whichever action failed
    // say so inline as well.
    if (isConnectivityError(error)) {
      requestErrorMessage = i18n.t('offline.requestFailed')
      if (useConnectionStore.getState().online) {
        useConnectionStore.getState().setOnline(false)
      }
    }
  }
}
