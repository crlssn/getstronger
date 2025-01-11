variable "bucket_name" {
  description = "The name of the S3 bucket"
  type        = string
}

variable "index_document" {
  description = "The index document for the S3 website"
  type        = string
  default     = "index.html"
}

variable "error_document" {
  description = "The error document for the S3 website"
  type        = string
  default     = "index.html"
}

variable "block_public_acls" {
  description = "Whether to block public ACLs"
  type        = bool
  default     = false
}

variable "block_public_policy" {
  description = "Whether to block public policies"
  type        = bool
  default     = false
}

variable "ignore_public_acls" {
  description = "Whether to ignore public ACLs"
  type        = bool
  default     = false
}

variable "restrict_public_buckets" {
  description = "Whether to restrict public buckets"
  type        = bool
  default     = false
}
