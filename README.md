puppet-kitchen
==============

Test Kitchen + Puppet

Overview
--------

Provisioning an Apache Software Foundation VM requires a lot of moving parts
-- things with names like `apt`, `gem`, `hiera`, `kitchen`, `puppet`, and
`r10k`.  To make things easier, the Apache infrastructure team provides a base
definition on top of which you install and configure 'modules'.  Modules can
be pretty much anything, examples being `ldap` and `tomcat`.

There are two sets of modules that you can draw from: [3rd party modules](https://github.com/apache/infrastructure-puppet/blob/deployment/Puppetfile) and [ASF modules](https://github.com/apache/infrastructure-puppet/tree/deployment/modules) modules.

As an alternative to a full configuration (which would involve DNS setup,
etc), the recommended process is to copy the relevant configuration file from
the [infrastructure-puppet](https://github.com/apache/infrastructure-puppet)
repository to the `default-ubuntu1464`, make changes to that subset of the
configuration, and only copying, committing, and pushing the results when
done.

Requirements
------------

+ [Vagrant](https://www.vagrantup.com/)
+ Ruby 2.0 or later
+ [Virtualbox](https://www.virtualbox.org/)

Installation
------------

### Clone Repositories

```
git clone https://github.com/apache/infrastructure-puppet-kitchen
git clone https://github.com/apache/infrastructure-puppet
```

### Install required gems

```
export ipr=<path to infrastructure-puppet repo>
export ipk=<path to infrastructure-puppet-kitchen repo>
gem install bundler test-kitchen kitchen-vagrant kitchen-sync
gem install kitchen-puppet -v 2.0.0
cd $ipr
bundle install
cd $ipk
bundle install
```

### Get modules

```
cd $ipr # this will pull in all the 3rd party modules at the specified versions we use in production
./bin/pull # this should only take a minute or two to run, check the output of $ipr/3rdParty
```

### Make modules useable

```
cd $ipk/puppet/modules
for i in $(ls $ipr/3rdParty); do ln -s $ipr/3rdParty/$i ./; done
for i in $(ls $ipr/modules); do ln -s $ipr/modules/$i ./; done
```

### Boostrapping a blank Default VM

*This section is for the Default VM*

To upgrade to the latest RubyGems:

    $ gem update --system # may need to be administrator or root

*NOTE*: RubyGems 1.1 and 1.2 have problems upgrading when there is no rubygems-update installed.

You will need to use the following instructions if you see Nothing to update. If you have an older version of RubyGems installed,
then you can still do it in two steps:

    $ gem install rubygems-update  # again, might need to be admin/root
    $ update_rubygems              # ... here too

In the suites section add the excludes in `$ipk/.kitchen.yml`  as follows:
```
suites:
  - name: default
    manifest: site.pp
    driver_config:
      network:
        - ["private_network", {ip: "192.168.33.2"}]
    excludes:
        - ubuntu1464  #you get this name from the "platforms"section in the .kitchen.yml file
        - apache-trusty #exclude any platform you aren't using
```

    $ cd $ipk
    $ kitchen create default
    $ kitchen converge default

Usage
-----

### Basic

Start by copying a machine configuration from the
[data/nodes](https://github.com/apache/infrastructure-puppet/tree/deployment/data/nodes)
repository to ``puppet/data/node/default-ubuntu1464.yaml``, editing it as
needed, and then running:

    $ cd $ipk
    $ kitchen converge default

This will bring up a vm, run puppet apply. From there, you can continue modifying the definition and/or writing new puppet module(s) (in ```puppet/modules/$module```) and testing by rerunning the above command.

You can directly `ssh` into your virtual machine using the following command:

    $ kitchen login default

If you have started a service like Apache httpd on this machine, you can
access it at the following IP address: `192.168.33.2`.

If you don't want to use the default image, you can also do `kitchen list` to get a list of available VMs.

### Modules

Modules are organized into two types: "third party" and "ASF custom".

Third party modules are listed in
[infrastructure-puppet/Puppetfile](https://raw.githubusercontent.com/apache/infrastructure-puppet/deployment/Puppetfile),
and updated using the `bin/pull` command described above.  Information on
locating a module can be found at
[puppet labs documentation](http://docs.puppetlabs.com/puppet/4.3/reference/quick_start_module_install_nix.html).

Custom modules are stored in
[infrastructure-puppet/modules/](https://github.com/apache/infrastructure-puppet/tree/deployment/modules).  Again, documentation on how to write a module can be found in the [puppet labs documentation](http://docs.puppetlabs.com/puppet/4.3/reference/quick_writing_nix.html).

### Cleanup

When done, you can take down and remove the VM with the following command:

    $ kitchen destroy default

### Further reading

Most the the [test-kitchen](https://github.com/test-kitchen/test-kitchen#usage)
option work with puppet, however make sure to see
the [kitchen-puppet](https://github.com/neillturner/kitchen-puppet/blob/master/provisioner_options.md)
documentation (even though the explanations aren't nearly as detailed as it needs to be).

Most information has been taken from [here](http://ehaselwanter.com/en/blog/2014/05/08/using-test-kitchen-with-puppet/)
