import { computed, ref } from 'vue'
import type { PaginationResponse } from '@/proto/api/v1/shared_pb.ts'

const emptyPageToken: Uint8Array = new Uint8Array(0)

export default () => {
  const pageToken = ref<Uint8Array>(emptyPageToken)

  const hasMorePages = computed(() => pageToken.value.length > 0)

  const resolvePageToken = (res: PaginationResponse | undefined): Uint8Array => {
    return res?.nextPageToken || emptyPageToken
  }

  return {
    pageToken,
    hasMorePages,
    emptyPageToken,
    resolvePageToken,
  }
}
