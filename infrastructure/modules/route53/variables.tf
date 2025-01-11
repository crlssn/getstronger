variable "zone_id" {
  description = "The ID of the hosted zone"
  type        = string
}

variable "domain" {
  description = "The domain name"
  type        = string
}

variable "subdomains" {
  description = "A map of subdomains and their configurations"
  type = map(object({
    type                   = string
    ttl                    = number
    records                = list(string)
    alias_name             = string
    alias_zone_id          = string
    evaluate_target_health = bool
  }))
}
