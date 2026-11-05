use strict; use warnings;
# A private section was all or nothing: the person it was written about
# could not read it either. A section may now name who may read it,
# without letting them type in it.
my $p = "app/report/[id]/page.tsx";
open(my $fh, "<", $p) or die "$p: $!";
binmode $fh; local $/; my $s = <$fh>; close $fh;
my $crlf = ($s =~ /\r\n/) ? 1 : 0;
$s =~ s/\r\n/\n/g;
if ($s =~ /read_emails/) { print "already done\n"; exit 0; }
my $a = '        if (!mineToFill && (s.private_to_route || !answered)) return null;' . "\n";
my $b = '        // Named readers see a private section once it has been written,'
      . "\n" . '        // but it stays locked to them.' . "\n"
      . '        const mayRead = ((s as any).read_emails || []).includes(profile?.email || "");' . "\n"
      . '        if (!mineToFill && !mayRead && (s.private_to_route || !answered)) return null;' . "\n";
($s =~ s/\Q$a\E/$b/) or do { print "could not place it\n"; exit 1 };
$s =~ s/\n/\r\n/g if $crlf;
open(my $out, ">", $p) or die $!; binmode $out; print $out $s; close $out;
print "ok\n";
