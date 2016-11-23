puppet-kitchen
==============

Test Kitchen + Puppet

Overview
--------

Provisioning an Apache Software Foundation VM requires a lot of moving parts
-- things with names like `apt`, `gem`, `hiera`, `kitchen`, `puppet`, and
`r10k`.  To make things easier, the Apache infrastructure team provides a base
definition on top of which you install and configure 'modules'.  Modules can
be pretty much anything, examples being `apt` and `tomcat`.

There are two sets of modules that you can draw from: [3rd party modules](https://github.com/apache/infrastructure-puppet/blob/deployment/Puppetfile) and [ASF])https://github.com/apache/infrastructure-puppet/tree/deployment/modules) modules.

As an alternative to a full configuration (which would involve DNS setup,
etc), the recommended process is to copy the relevant configuration file from
the [infrastructure-puppet](https://github.com/apache/infrastructure-puppet)
repository to the `default-ubuntu1464`, make changes to that subset of the
configuration, and only copying, committing, and pushing the results when
done.

Requirements
------------

+ [Vagrant](https://www.vagrantup.com/)
  + Must install from [here](https://www.vagrantup.com/docs/installation/) not the gem
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
gem install bundler
cd <path to infrastructure-puppet repo>
bundle install
```

### Get modules

```
cd <path to infra puppet repo>
./bin/pull # this will pull in all the 3rd party modules at the specified versions we use in production
```

### Make modules useable

```
cd <path to puppet-kitchen repo>
cd puppet/modules
export ipr=<path to infra-puppet repo>
for i in $(ls $ipr/3rdParty); do ln -s $ipr/3rdParty/$i ./; done
for i in $(ls $ipr/modules); do ln -s $ipr/modules/$i ./; done
```

### Boostrapping

```
kitchen create default
kitchen converge default
```

Usage
-----

### Basic

Start by copying a machine configuration from the
[data/nodes](https://github.com/apache/infrastructure-puppet/tree/deployment/data/nodes)
repository to ``puppet/data/node/default-ubuntu1464.yaml``, editing it as
needed, and then running:

```
kitchen converge default
```

This will bring up a vm, run puppet apply. From there, you can continue modifying the definition and/or writing new puppet module(s) (in ```puppet/modules/$module```) and testing by rerunning the above command.

You can directly `ssh` into your virtual machine using the following command:

```
kitchen login default
```

If you have started a service like Apache httpd on this machine, you can
access it at the following IP address: `192.168.33.2`.

### Modules

Modules are organized into two types: "third party" and "ASF custom".

Third party modules are listed in
[infrastructure-puppet/Puppetfile](https://raw.githubusercontent.com/apache/infrastructure-puppet/deployment/Puppetfile),
and updated using the `bin/pull` command described above, which uses `r10k` to populate the 3rdParty directory. This is distinctly different than the standard method of installing modules using `puppet module install`.

Custom modules are stored in
[infrastructure-puppet/modules/](https://github.com/apache/infrastructure-puppet/tree/deployment/modules). Documentation on how to write a module can be found in the [puppet labs documentation](https://docs.puppet.com/puppet/3.8/reference/modules_fundamentals.html).

### Cleanup

When done, you can take down and remove the VM with the following command:

```
kitchen destroy default
```

### Further reading

Most the the [test-kitchen](https://github.com/test-kitchen/test-kitchen#usage)
option work with puppet, however make sure to see
the [kitchen-puppet](https://github.com/neillturner/kitchen-puppet/blob/master/provisioner_options.md)
documentation (even though the explanations aren't nearly as detailed as it needs to be).

Most information has been taken from [here](http://ehaselwanter.com/en/blog/2014/05/08/using-test-kitchen-with-puppet/)
