export interface DropdownItem {
  func?: () => Promise<void>
  href?: string
  title: string
}
