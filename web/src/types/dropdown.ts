export interface DropdownItem {
  href?: string
  func?: () => Promise<any>
  title: string
}
