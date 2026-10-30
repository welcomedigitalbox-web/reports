use strict; use warnings;
# Whether the button appears was decided from who opened the report. On a
# shared sheet that is nobody in particular, so the server answers it now.
my $p = "app/report/[id]/page.tsx";
open(my $fh, "<", $p) or die "$p: $!";
binmode $fh; local $/; my $s = <$fh>; close $fh;
my $crlf = ($s =~ /\r\n/) ? 1 : 0;
$s =~ s/\r\n/\n/g;
if ($s =~ /can_review_submission/) { print "already done\n"; exit 0; }
my $a = q{supabase.rpc("can_approve_email", { p_email: (s as Submission).created_by }),};
my $b = q{supabase.rpc("can_review_submission", { p_id: (s as Submission).id }),};
($s =~ s/\Q$a\E/$b/) or do { print "could not place it\n"; exit 1 };
$s =~ s/\n/\r\n/g if $crlf;
open(my $out, ">", $p) or die $!; binmode $out; print $out $s; close $out;
print "ok\n";
