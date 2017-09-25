puppet-kitchen Windows Environment
==============

Test Kitchen + Puppet + Windows

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

+ This doc assumes you are running a working version of the existing kitchen from Master. Please follow the list of instructions in that branch.

Usage
-----

### Basic

Currently the base machine yaml is hard coded to ..puppet/data/nodes/wintest-windows.yaml. For the remainder of this doc, that will referenced as such.

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

### Modules

Modules are organized into two types: "third party" and "ASF custom".

Third party modules are listed in
[infrastructure-puppet/Puppetfile](https://raw.githubusercontent.com/apache/infrastructure-puppet/deployment/Puppetfile),
and updated using the `bin/pull` command described above.  Information on
locating a module can be found at
[puppet labs documentation](http://docs.puppetlabs.com/puppet/4.3/reference/quick_start_module_install_nix.html).

Custom modules are stored in
[infrastructure-puppet/environments/windows/modules/](https://github.com/apache/infrastructure-puppet/tree/deployment/environments/windows/modules).  Again, documentation on how to write a module can be found in the [puppet labs documentation](http://docs.puppetlabs.com/puppet/4.3/reference/quick_writing_nix.html).

Node data are still stored in ../data/nodes/machine.a.o.yaml format.

### Usage

Same spin up as the other kitchen:

    $ kitchen create wintest-windows

However this will open a VirutalBox window where you can login and interact with Windows (instead of ssh)
Default username and password is in .kitchen.yml

### Cleanup

When done, you can take down and remove the VM with the following command:

    $ kitchen destroy default

### Further reading

Most the the [test-kitchen](https://github.com/test-kitchen/test-kitchen#usage)
option work with puppet, however make sure to see
the [kitchen-puppet](https://github.com/neillturner/kitchen-puppet/blob/master/provisioner_options.md)
documentation (even though the explanations aren't nearly as detailed as it needs to be).

Most information has been taken from [here](http://ehaselwanter.com/en/blog/2014/05/08/using-test-kitchen-with-puppet/)
