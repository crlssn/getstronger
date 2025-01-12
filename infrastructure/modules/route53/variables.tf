# variable "zone_id" {
#   description = "The Route 53 hosted zone ID"
#   type        = string
# }

variable "domain" {
  description = "The domain name for the hosted zone"
  type        = string
}

variable "records" {
  description = "A map of standard DNS records (e.g., A, CNAME)"
  type = map(object({
    type    = string
    ttl     = number
    records = list(string)
  }))
  default = {}
}

variable "aliases" {
  description = "A map of alias DNS records (e.g., pointing to CloudFront or S3)"
  type = map(object({
    type                   = string
    alias_name             = string
    alias_zone_id          = string
    evaluate_target_health = bool
  }))
  default = {}
}

variable "ssl_validation_records" {
  description = "A map of SSL validation DNS records"
  type = map(object({
    name  = string
    type  = string
    value = string
    ttl   = number
  }))
  default = {}
}
