variable "regions" {
  description = "Regions where the Outline Lightsail instances run, e.g. [\"ap-southeast-1\"]."
  type        = list(string)
}

variable "user_name" {
  description = "IAM user the dashboard Worker signs requests as."
  type        = string
  default     = "outline-dashboard-reboot"
}

variable "tag_key" {
  description = "Only Lightsail instances carrying this tag can be rebooted."
  type        = string
  default     = "outline-dashboard"
}

variable "tag_value" {
  type    = string
  default = "reboot"
}
