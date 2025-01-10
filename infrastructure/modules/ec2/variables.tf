variable "ami" {
  description = "The AMI to use for the EC2 instance"
  type        = string
}

variable "instance_type" {
  description = "The instance type for the EC2 instance"
  type        = string
}

variable "iam_instance_profile" {
  description = "The IAM instance profile to attach to the EC2 instance"
  type        = string
}

variable "user_data" {
  description = "The user data to provide when launching the instance"
  type        = string
}

variable "key_name" {
  description = "The name of the key pair"
  type        = string
}

variable "public_key" {
  description = "The public key material for the key pair"
  type        = string
}

variable "ssh_security_group_name" {
  description = "The name of the SSH security group"
  type        = string
  default     = "allow_ssh"
}

variable "ssh_security_group_description" {
  description = "Description for the SSH security group"
  type        = string
  default     = "Allow SSH inbound traffic"
}

variable "ssh_ingress_cidr_blocks" {
  description = "CIDR blocks allowed for SSH access"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "api_security_group_name" {
  description = "The name of the API security group"
  type        = string
  default     = "allow_api_access"
}

variable "api_security_group_description" {
  description = "Description for the API security group"
  type        = string
  default     = "Allow inbound traffic to API"
}

variable "api_http_port" {
  description = "The HTTP port for API access"
  type        = number
  default     = 8080
}

variable "api_https_port" {
  description = "The HTTPS port for API access"
  type        = number
  default     = 443
}

variable "api_ingress_cidr_blocks" {
  description = "CIDR blocks allowed for API access"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
