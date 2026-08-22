export interface DropdownItem {
  // Rendered in the danger colour. Not every menu item is a delete: moving an
  // exercise between groups sits in the same menu and is not one.
  destructive?: boolean
  func?: () => Promise<void>
  href?: string
  title: string
}
