import importlib.util
from pathlib import Path
import unittest
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2] / 'scripts/meeting-engine'
def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
resources=load('resource_policy')
community=load('community_worker')
alignment=load('whisperx_alignment_trial')

class MeetingPolicies(unittest.TestCase):
    def test_community_auto_checks_cuda_and_free_vram(self):
        def fake(available,free):
            return SimpleNamespace(cuda=SimpleNamespace(is_available=lambda:available,mem_get_info=lambda:(free,8*resources.GIB)))
        self.assertEqual(community.choose_device(fake(False,8*resources.GIB),'auto'),'cpu')
        self.assertEqual(community.choose_device(fake(True,resources.GIB),'auto'),'cpu')
        self.assertEqual(community.choose_device(fake(True,4*resources.GIB),'auto'),'cuda')
        self.assertEqual(community.choose_device(fake(True,4*resources.GIB),'cpu'),'cpu')
    def test_speaker_counts_are_explicit_and_preserve_fifteen_cap(self):
        self.assertEqual(community.speaker_constraints({}), {'max_speakers':15})
        self.assertEqual(community.speaker_constraints({'minSpeakers':8,'maxSpeakers':9}), {'min_speakers':8,'max_speakers':9})
        self.assertEqual(community.speaker_constraints({'exactSpeakers':12}), {'num_speakers':12})
        self.assertEqual(community.speaker_constraints({'exactSpeakers':15}), {'num_speakers':15})
        for bad in [{'maxSpeakers':16},{'minSpeakers':9,'maxSpeakers':8},{'exactSpeakers':True},{'exactSpeakers':4.5},{'maxSpeakers':None},{'exactSpeakers':9,'maxSpeakers':8}]:
            with self.assertRaises(ValueError): community.speaker_constraints(bad)

    def test_ram_and_cpu_policy(self):
        for total,available,cpus,tier,threads,window in [(4,3,2,'compact',1,10),(8,6,8,'compact',2,10),(16,12,8,'balanced',4,20),(64,48,32,'powerful',8,30),(64,3,32,'compact',2,10)]:
            result=resources.policy(total*resources.GIB,available*resources.GIB,cpus)
            self.assertEqual((result['tier'],result['cpuThreads'],result['windowSeconds']),(tier,threads,window))
        self.assertEqual(resources.policy(cpus=1)['cpuThreads'],1)

    def test_optional_alignment_refuses_insufficient_budget_without_allocating(self):
        with patch.object(resources,'snapshot',return_value={'budgetBytes':100}):
            with self.assertRaises(resources.MemoryBudgetError): resources.check_model_ram(resources.GIB,'cpu')

    def test_gpu_batch_uses_free_vram_not_system_ram(self):
        self.assertEqual(resources.diarization_batch('powerful',512*1024**2),1)
        self.assertEqual(resources.diarization_batch('powerful',resources.GIB),2)
        self.assertEqual(resources.diarization_batch('powerful',2*resources.GIB),4)
        self.assertEqual(resources.diarization_batch('powerful',4*resources.GIB),8)
        self.assertEqual(resources.diarization_batch('compact',8*resources.GIB),2)

    def test_window_reader_seeks_and_reads_only_requested_audio(self):
        calls=[]
        class Stream:
            def getframerate(self): return 16000
            def setpos(self,pos): calls.append(('seek',pos))
            def readframes(self,count): calls.append(('read',count)); return b'window'
        class Array:
            def astype(self,_dtype): return self
            def __truediv__(self,_scale): return self
        class Numpy:
            float32='float32'
            def frombuffer(self,data,dtype): return Array()
        _,local=alignment.window_audio(Stream(),{'start':3600,'end':3610,'text':'Eg er samd.'},Numpy())
        self.assertEqual(calls,[('seek',57600000),('read',160000)])
        self.assertEqual(local,{'start':0,'end':10,'text':'Eg er samd.'})
        self.assertEqual(alignment.rebase_words({'word_segments':[{'word':'Eg','start':.1,'end':.4,'score':.9}]},3600)[0]['start'],3600.1)

if __name__=='__main__': unittest.main()
