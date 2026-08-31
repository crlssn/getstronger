export interface DropdownItem {
  // Rendered in the danger colour. Not every menu item is a delete: moving an
  // exercise between groups sits in the same menu and is not one.
  destructive?: boolean
  // Both, because most menu actions are synchronous and one — unfollowing —
  // is not. DropdownButton voids whatever comes back.
  func?: () => void | Promise<void>
  href?: string
  title: string
}
