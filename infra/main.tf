# resource "aws_s3_bucket" "terraform_state_for_andromeda" {
#   bucket = "getstronger-terraform-state"
# }
#
# resource "aws_dynamodb_table" "terraform_lock_state" {
#   name         = "dynamoDB_to_lock_terraform_state"
#   billing_mode = "PAY_PER_REQUEST"
#   hash_key     = "LockID"
#   attribute {
#     name = "LockID"
#     type = "S"
#   }
# }

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.16"
    }
  }
  backend "s3" {
    bucket = "www.getstronger.co"
    key = "state.tfstate"
  }

  # backend "s3" {
  #   bucket = "getstronger-terraform-state" # Replace with your bucket name
  #   key = "state.tfstate"     # Define a path to store the state file within the bucket
  #   region = "eu-west-2"                # Replace with your AWS region
  #   dynamodb_table = "terraform-lock-table"        # The DynamoDB table to use for locking
  #   encrypt = true                          # Enable encryption at rest
  # }

  required_version = ">= 1.2.0"
}

provider "aws" {
  region = var.aws_region
}

# resource "aws_dynamodb_table" "terraform_lock" {
#   name         = "terraform-lock"
#   billing_mode = "PAY_PER_REQUEST"
#   hash_key     = "LockID"
#
#   attribute {
#     name = "LockID"
#     type = "S"
#   }
# }

# resource "aws_instance" "app_server" {
#   ami           = "ami-830c94e3"
#   instance_type = "t2.micro"
#
#   tags = {
#     Name = "ExampleAppServerInstance"
#   }
# }
