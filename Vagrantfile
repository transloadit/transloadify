VAGRANTFILE_API_VERSION = "2"
SHARE_NAME              = "transloadify"
SHARE_GUEST_DIR         = "/usr/src/transloadify"
Vagrant.require_version ">= 1.6"

Vagrant.configure(VAGRANTFILE_API_VERSION) do |config|
  # This is a minimal ubuntu box that should be very close to the AMI we use
  # in production (the official vagrant boxes include ruby and shit)
  config.vm.box     = "ubuntu-12.04-64bit"
  config.vm.box_url = "http://felixge.s3.amazonaws.com/12/ubuntu-12.04-64bit.box"

  # IP for the vm (only available to the host)
  config.vm.network "private_network", ip: "192.168.33.7"
  config.vm.network "forwarded_port",  guest: 22, host: 1237

  config.vm.synced_folder ".", SHARE_GUEST_DIR

  config.vm.provider "virtualbox" do |v|
    v.customize ["modifyvm",     :id, "--memory", 4096, "--cpus", 8]
    v.customize ["setextradata", :id, "VBoxInternal2/SharedFoldersEnableSymlinksCreate/#{SHARE_NAME}", "1"]
  end

  # Installs login.sh which sets up environment right after a `vagrant ssh`
  config.vm.provision :shell, :inline => "bash #{SHARE_GUEST_DIR}/scripts/login.sh"
  # Installs dependencies
  config.vm.provision :shell, :inline => "bash #{SHARE_GUEST_DIR}/scripts/init.sh"
end
