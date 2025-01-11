variable "domain_name" {
  description = "The domain name for the SSL certificate"
  type        = string
}

variable "zone_id" {
  description = "The Route 53 hosted zone ID for DNS validation"
  type        = string
}

variable "origin_domain_name" {
  description = "The origin domain name for the CloudFront distribution"
  type        = string
}

variable "https_port" {
  description = "The HTTPS port for the origin"
  type        = number
  default     = 443
}

variable "origin_protocol_policy" {
  description = "The protocol policy for the origin"
  type        = string
  default     = "https-only"
}

variable "origin_ssl_protocols" {
  description = "The SSL protocols for the origin"
  type        = list(string)
  default     = ["TLSv1.2"]
}

variable "default_root_object" {
  description = "The default root object for the CloudFront distribution"
  type        = string
  default     = "index.html"
}

variable "alias" {
  description = "The alias for the CloudFront distribution"
  type        = string
}

variable "error_page_path" {
  description = "The error page path for the CloudFront distribution"
  type        = string
  default     = "/index.html"
}

variable "tags" {
  description = "Tags to apply to the CloudFront distribution"
  type        = map(string)
  default     = {}
}
